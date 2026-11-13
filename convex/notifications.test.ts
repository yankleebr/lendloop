import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_EVENTS_PER_TRANSACTION, RETRY_DELAYS_MS } from "./lib/automationRules";
import { verifyWebhookSignature } from "./lib/hmac";
import {
  classifyResponse,
  counterpartFor,
  emitLoanEvent,
  readWebhookConfig,
  recipientFor,
  retryDelayMs,
} from "./lib/notifications";
import { LOAN_EVENT_TYPES } from "./lib/validators";
import * as notificationsModule from "./notifications";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const WEBHOOK_URL = "https://n8n.test/webhook/x";
const SECRET = "s".repeat(64);
const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", name: "Bob", email: "bob@example.com" };
const CAROL = { subject: "user_carol", name: "Carol", email: "carol@example.com" };
const DAVE = { subject: "user_dave", name: "Dave", email: "dave@example.com" };
const DRILL = { name: "Drill", category: "power_tools", condition: "good", description: "" } as const;
const PERIOD = { startDate: "2026-11-13", endDate: "2026-11-14" };

let fetchMock: Mock<(url: string, init: RequestInit) => Promise<Response>>;
let logSpy: Mock;
let warnSpy: Mock;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  vi.stubEnv("N8N_WEBHOOK_URL", WEBHOOK_URL);
  vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {}) as unknown as Mock;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}) as unknown as Mock;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Alice owns a Drill; Bob and Dave are users; Carol is an admin. */
async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  const bob = t.withIdentity(BOB);
  const carol = t.withIdentity(CAROL);
  const dave = t.withIdentity(DAVE);
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const carolId = await carol.mutation(api.users.store, {});
  const daveId = await dave.mutation(api.users.store, {});
  await t.mutation(internal.users.setRole, { userId: carolId, role: "admin" });
  const toolId = await alice.mutation(api.tools.create, DRILL);
  return { t, alice, bob, admin: carol, dave, aliceId, bobId, carolId, daveId, toolId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function logs(s: Setup): Promise<Doc<"automationLogs">[]> {
  return s.t.run((ctx) => ctx.db.query("automationLogs").collect());
}

async function scheduledDeliveries(s: Setup) {
  const jobs = await s.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.filter((job) => job.name.includes("deliver"));
}

function drain(s: Setup) {
  return s.t.finishAllScheduledFunctions(vi.runAllTimers);
}

function respond(...statuses: number[]) {
  for (const status of statuses) {
    fetchMock.mockImplementationOnce(async () => new Response(null, { status }));
  }
}

function request(s: Setup, who: Setup["bob"] = s.bob) {
  return who.mutation(api.loans.request, { toolId: s.toolId, ...PERIOD });
}

function insertPending(s: Setup, borrowerId: Id<"users">): Promise<Id<"loans">> {
  return s.t.run((ctx) =>
    ctx.db.insert("loans", {
      toolId: s.toolId,
      borrowerId,
      lenderId: s.aliceId,
      status: "pending",
      ...PERIOD,
    }),
  );
}

function sentBody(call = 0) {
  const [, init] = fetchMock.mock.calls[call];
  return JSON.parse(init.body as string);
}

describe("event emission", () => {
  it("request emits loan.requested to the lender, pending and scheduled", async () => {
    const s = await setup();
    const loanId = await request(s);
    const [row] = await logs(s);
    expect(row).toMatchObject({
      loanId,
      kind: "notification",
      event: "loan.requested",
      recipientId: s.aliceId,
      idempotencyKey: `notification:${loanId}:loan.requested`,
      status: "pending",
      attempts: 0,
    });
    expect(Math.abs(Date.now() - row.occurredAt)).toBeLessThan(1000);
    expect(await scheduledDeliveries(s)).toHaveLength(1);
  });

  it("occurredAt of a transition equals the loan's event timestamp", async () => {
    const s = await setup();
    const loanId = await request(s);
    await s.alice.mutation(api.loans.approve, { loanId });
    const loan = await s.t.run((ctx) => ctx.db.get(loanId));
    const approved = (await logs(s)).find((r) => r.event === "loan.approved");
    expect(approved!.occurredAt).toBe(loan!.decidedAt);
  });

  it("each transition emits one event to the party that did not act", async () => {
    const s = await setup();
    const approvedId = await request(s);
    await s.alice.mutation(api.loans.approve, { loanId: approvedId });
    await s.alice.mutation(api.loans.markReturned, { loanId: approvedId });
    const rejectedId = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    await s.alice.mutation(api.loans.reject, { loanId: rejectedId });
    const cancelledId = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      startDate: "2026-11-25",
      endDate: "2026-11-26",
    });
    await s.bob.mutation(api.loans.cancel, { loanId: cancelledId });

    const rows = (await logs(s)).map((r) => [r.loanId, r.event, r.recipientId, r.status]);
    expect(rows).toEqual([
      [approvedId, "loan.requested", s.aliceId, "pending"],
      [approvedId, "loan.approved", s.bobId, "pending"],
      [approvedId, "loan.returned", s.bobId, "pending"],
      [rejectedId, "loan.requested", s.aliceId, "pending"],
      [rejectedId, "loan.rejected", s.bobId, "pending"],
      [cancelledId, "loan.requested", s.aliceId, "pending"],
      [cancelledId, "loan.cancelled", s.aliceId, "pending"],
    ]);
    expect(await scheduledDeliveries(s)).toHaveLength(7);

    await drain(s);
    expect((await logs(s)).every((r) => r.status === "sent" && r.attempts === 1)).toBe(true);
    const manualReject = sentBody(4);
    expect(manualReject.type).toBe("loan.rejected");
    expect(manualReject.loan.closeReason).toBeNull();
  });

  it("emits nothing when the mutation throws", async () => {
    const s = await setup();
    const loanId = await request(s);
    await s.alice.mutation(api.loans.reject, { loanId });
    const before = (await logs(s)).length;
    const scheduledBefore = (await scheduledDeliveries(s)).length;

    const approvedId = await insertPending(s, s.daveId);
    await s.t.run((ctx) => ctx.db.patch(approvedId, { status: "approved" }));

    await expect(s.alice.mutation(api.loans.request, { toolId: s.toolId, ...PERIOD })).rejects.toThrow(
      ConvexError,
    );
    await expect(s.bob.mutation(api.loans.approve, { loanId })).rejects.toThrow(ConvexError);
    await expect(s.alice.mutation(api.loans.reject, { loanId })).rejects.toThrow(ConvexError);
    await expect(s.alice.mutation(api.tools.remove, { toolId: s.toolId })).rejects.toThrow(
      ConvexError,
    );

    expect(await logs(s)).toHaveLength(before);
    expect(await scheduledDeliveries(s)).toHaveLength(scheduledBefore);
  });
});

describe("auto-rejections", () => {
  it("approve rejects overlapping pending requests with period_taken", async () => {
    const s = await setup();
    const bobLoan = await request(s);
    const daveLoan = await request(s, s.dave);
    const carolLoan = await request(s, s.admin);
    await drain(s);
    fetchMock.mockClear();

    await s.alice.mutation(api.loans.approve, { loanId: bobLoan });
    const fresh = (await logs(s)).filter((r) => r.event !== "loan.requested");
    expect(fresh.map((r) => [r.loanId, r.event, r.recipientId])).toEqual([
      [bobLoan, "loan.approved", s.bobId],
      [daveLoan, "loan.rejected", s.daveId],
      [carolLoan, "loan.rejected", s.carolId],
    ]);

    await drain(s);
    const rejected = fetchMock.mock.calls
      .map((_, i) => sentBody(i))
      .filter((body) => body.type === "loan.rejected");
    expect(rejected.map((b) => b.loan.closeReason)).toEqual(["period_taken", "period_taken"]);
    expect(rejected.every((b) => b.loan.removedByModerator === false)).toBe(true);
  });

  it("owner removal sends tool_removed with removedByModerator false", async () => {
    const s = await setup();
    await request(s);
    await request(s, s.dave);
    await drain(s);
    fetchMock.mockClear();

    await s.alice.mutation(api.tools.remove, { toolId: s.toolId });
    await drain(s);
    const bodies = fetchMock.mock.calls.map((_, i) => sentBody(i));
    expect(bodies.map((b) => [b.type, b.loan.closeReason, b.loan.removedByModerator])).toEqual([
      ["loan.rejected", "tool_removed", false],
      ["loan.rejected", "tool_removed", false],
    ]);
    expect(bodies.map((b) => b.recipient._id).sort()).toEqual([s.bobId, s.daveId].sort());
  });

  it("admin removal sends removedByModerator true", async () => {
    const s = await setup();
    await request(s);
    await drain(s);
    fetchMock.mockClear();

    await s.admin.mutation(api.admin.removeTool, { toolId: s.toolId });
    await drain(s);
    expect(sentBody().loan).toMatchObject({ closeReason: "tool_removed", removedByModerator: true });
  });

  it("over the event budget, extra rows are failed/event_budget and the removal succeeds", async () => {
    const s = await setup();
    const extra = 3;
    await s.t.run(async (ctx) => {
      for (let i = 0; i < MAX_EVENTS_PER_TRANSACTION + extra; i++) {
        await ctx.db.insert("loans", {
          toolId: s.toolId,
          borrowerId: s.bobId,
          lenderId: s.aliceId,
          status: "pending",
          ...PERIOD,
        });
      }
    });

    await s.alice.mutation(api.tools.remove, { toolId: s.toolId });
    const rows = await logs(s);
    expect(rows).toHaveLength(MAX_EVENTS_PER_TRANSACTION + extra);
    const budget = rows.filter((r) => r.status === "failed");
    expect(budget).toHaveLength(extra);
    expect(budget.every((r) => r.lastError === "event_budget" && r.attempts === 0)).toBe(true);
    expect(await scheduledDeliveries(s)).toHaveLength(MAX_EVENTS_PER_TRANSACTION);
    expect(await s.t.run((ctx) => ctx.db.get(s.toolId))).toMatchObject({ isActive: false });
  });
});

describe("payload", () => {
  it("contains exactly the documented keys and only the recipient's email", async () => {
    const s = await setup();
    const loanId = await request(s);
    await drain(s);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    const raw = init.body as string;
    const body = JSON.parse(raw);
    expect(Object.keys(body).sort()).toEqual(
      ["counterpart", "eventId", "idempotencyKey", "loan", "occurredAt", "recipient", "tool", "type", "version"],
    );
    expect(Object.keys(body.loan).sort()).toEqual(
      ["closeReason", "endDate", "id", "removedByModerator", "startDate"],
    );
    expect(Object.keys(body.counterpart).sort()).toEqual(["_id", "isTrustedLender", "name"]);
    expect(Object.keys(body.recipient).sort()).toEqual(["_id", "email", "isTrustedLender", "name"]);
    const [row] = await logs(s);
    expect(body).toMatchObject({
      version: 1,
      eventId: row._id,
      idempotencyKey: row.idempotencyKey,
      type: "loan.requested",
      occurredAt: new Date(row.occurredAt).toISOString(),
      loan: { id: loanId, ...PERIOD, closeReason: null, removedByModerator: false },
      tool: { name: "Drill" },
      recipient: { _id: s.aliceId, name: "Alice", email: ALICE.email },
      counterpart: { _id: s.bobId, name: "Bob" },
    });
    expect(raw).not.toContain(BOB.email);
    expect(raw).not.toContain("tokenIdentifier");
    expect(raw).not.toContain("role");
  });

  it("sends recipient.email = null when the recipient has no email", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.aliceId, { email: undefined }));
    await request(s);
    await drain(s);
    expect(sentBody().recipient.email).toBeNull();
  });

  it("signs the exact body with verifiable headers", async () => {
    const s = await setup();
    await request(s);
    await drain(s);

    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe("LendLoop-Webhooks/1");
    expect(headers["X-LendLoop-Event-Id"]).toBe(sentBody().eventId);
    expect(headers["X-LendLoop-Signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(
      await verifyWebhookSignature({
        secret: SECRET,
        rawBody: init.body as string,
        timestampHeader: headers["X-LendLoop-Timestamp"],
        signatureHeader: headers["X-LendLoop-Signature"],
        nowSec: Math.floor(Date.now() / 1000),
      }),
    ).toBe(true);
  });

  it("never logs the URL, secret, signature, names or emails", async () => {
    const s = await setup();
    respond(503);
    await request(s);
    await drain(s);
    const lines = [...logSpy.mock.calls, ...warnSpy.mock.calls].map((args) => args.join(" "));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const secret of [WEBHOOK_URL, SECRET, "Alice", "Bob", ALICE.email, "v1="]) {
        expect(line).not.toContain(secret);
      }
    }
  });
});

describe("idempotency", () => {
  it("emitting the same event twice creates one row and one schedule", async () => {
    const s = await setup();
    const loanId = await insertPending(s, s.bobId);
    await s.t.run(async (ctx) => {
      const loan = (await ctx.db.get(loanId))!;
      await emitLoanEvent(ctx, loan, "loan.requested");
      await emitLoanEvent(ctx, loan, "loan.requested");
    });
    expect(await logs(s)).toHaveLength(1);
    expect(await scheduledDeliveries(s)).toHaveLength(1);
  });

  it("delivering a sent row again does nothing", async () => {
    const s = await setup();
    await request(s);
    await drain(s);
    const [row] = await logs(s);
    expect(row.status).toBe("sent");

    await s.t.action(internal.notifications.deliver, { logId: row._id });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await logs(s))[0]).toEqual(row);
  });
});

describe("retries", () => {
  async function firstAttempt(s: Setup) {
    await request(s);
    const [row] = await logs(s);
    await s.t.action(internal.notifications.deliver, { logId: row._id });
    return (await logs(s))[0];
  }

  it("503, 503, 200 → sent after 3 attempts", async () => {
    const s = await setup();
    respond(503, 503, 200);
    await request(s);
    await drain(s);
    expect((await logs(s))[0]).toMatchObject({ status: "sent", attempts: 3, lastStatusCode: 200 });
    expect((await logs(s))[0].lastError).toBeUndefined();
  });

  it("schedules retries within ±20 % of the backoff table", async () => {
    const s = await setup();
    respond(503, 503);
    const row = await firstAttempt(s);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "http_503" });
    const first = row.nextAttemptAt! - row.updatedAt;
    expect(first).toBeGreaterThanOrEqual(RETRY_DELAYS_MS[0] * 0.8);
    expect(first).toBeLessThanOrEqual(RETRY_DELAYS_MS[0] * 1.2);

    await s.t.action(internal.notifications.deliver, { logId: row._id });
    const second = (await logs(s))[0];
    const delay = second.nextAttemptAt! - second.updatedAt;
    expect(delay).toBeGreaterThanOrEqual(RETRY_DELAYS_MS[1] * 0.8);
    expect(delay).toBeLessThanOrEqual(RETRY_DELAYS_MS[1] * 1.2);
  });

  it("always 503 → failed after 5 attempts", async () => {
    const s = await setup();
    fetchMock.mockImplementation(async () => new Response(null, { status: 503 }));
    await request(s);
    await drain(s);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [row] = await logs(s);
    expect(row).toMatchObject({ status: "failed", attempts: 5, lastError: "http_503" });
    expect(row.nextAttemptAt).toBeUndefined();
  });

  it("classifies network errors and timeouts as retryable", async () => {
    const s = await setup();
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await firstAttempt(s)).toMatchObject({ status: "pending", lastError: "network" });

    const t2 = await setup();
    fetchMock.mockImplementationOnce(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    expect(await firstAttempt(t2)).toMatchObject({ status: "pending", lastError: "timeout" });
  });

  it("honors Retry-After on 429", async () => {
    const s = await setup();
    fetchMock.mockImplementationOnce(
      async () => new Response(null, { status: 429, headers: { "Retry-After": "600" } }),
    );
    const row = await firstAttempt(s);
    expect(row.nextAttemptAt! - row.updatedAt).toBeGreaterThanOrEqual(600_000);
  });

  it("retries 404 (unpublished workflow)", async () => {
    const s = await setup();
    respond(404);
    expect(await firstAttempt(s)).toMatchObject({ status: "pending", lastError: "http_404" });
  });

  it.each([401, 400, 410, 302])("%i is final after one attempt", async (status) => {
    const s = await setup();
    respond(status);
    await request(s);
    await drain(s);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await logs(s))[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: `http_${status}`,
      lastStatusCode: status,
    });
  });
});

describe("missing configuration", () => {
  it.each([
    ["URL empty", "N8N_WEBHOOK_URL", ""],
    ["URL not https", "N8N_WEBHOOK_URL", "http://n8n.test/webhook/x"],
    ["secret too short", "N8N_WEBHOOK_SECRET", "short"],
  ])("%s → failed/not_configured without fetch", async (_label, name, value) => {
    vi.stubEnv(name, value);
    const s = await setup();
    const loanId = await request(s);
    expect(loanId).toBeDefined();
    await drain(s);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await logs(s))[0]).toMatchObject({ status: "failed", lastError: "not_configured" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("pure helpers", () => {
  it("classifyResponse", () => {
    expect(classifyResponse(200)).toEqual({ kind: "sent", statusCode: 200 });
    expect(classifyResponse(204)).toEqual({ kind: "sent", statusCode: 204 });
    for (const status of [404, 408, 409, 425, 429, 500, 502, 503, 504]) {
      expect(classifyResponse(status)).toEqual({ kind: "retry", code: `http_${status}`, statusCode: status });
    }
    for (const status of [301, 302, 400, 401, 403, 410, 413, 422, 418]) {
      expect(classifyResponse(status)).toEqual({ kind: "final", code: `http_${status}`, statusCode: status });
    }
    expect(classifyResponse("timeout")).toEqual({ kind: "retry", code: "timeout" });
    expect(classifyResponse("network")).toEqual({ kind: "retry", code: "network" });
    expect(classifyResponse(429, "120")).toMatchObject({ retryAfterMs: 120_000 });
    expect(classifyResponse(503, "7")).toMatchObject({ retryAfterMs: 7_000 });
    expect(classifyResponse(500, "7")).not.toHaveProperty("retryAfterMs");
    expect(classifyResponse(429, "Wed, 21 Oct 2026 07:28:00 GMT")).not.toHaveProperty("retryAfterMs");
  });

  it("retryDelayMs follows the table, jitter bounds, Retry-After and cap", () => {
    RETRY_DELAYS_MS.forEach((base, i) => {
      expect(retryDelayMs(i + 1, 0.5)).toBe(base);
      expect(retryDelayMs(i + 1, 0)).toBe(base * 0.8);
      expect(retryDelayMs(i + 1, 0.999999)).toBeLessThanOrEqual(base * 1.2);
    });
    expect(retryDelayMs(1, 0.5, 600_000)).toBe(600_000);
    expect(retryDelayMs(1, 0.5, 10 * 3_600_000)).toBe(1_800_000);
    expect(retryDelayMs(4, 0.999999)).toBeLessThanOrEqual(1_800_000);
  });

  it("recipientFor / counterpartFor", () => {
    const loan = {
      _id: "loan" as Id<"loans">,
      borrowerId: "borrower" as Id<"users">,
      lenderId: "lender" as Id<"users">,
    };
    const expected = {
      "loan.requested": "lender",
      "loan.approved": "borrower",
      "loan.rejected": "borrower",
      "loan.cancelled": "lender",
      "loan.returned": "borrower",
    };
    for (const event of LOAN_EVENT_TYPES) {
      expect(recipientFor(event, loan)).toBe(expected[event]);
      expect(counterpartFor(event, loan)).toBe(expected[event] === "lender" ? "borrower" : "lender");
    }
  });

  it("readWebhookConfig requires both vars, https and a long secret", () => {
    expect(readWebhookConfig()).toEqual({ url: WEBHOOK_URL, secret: SECRET });
    vi.stubEnv("N8N_WEBHOOK_URL", "not a url");
    expect(readWebhookConfig()).toBeNull();
    vi.stubEnv("N8N_WEBHOOK_URL", WEBHOOK_URL);
    vi.stubEnv("N8N_WEBHOOK_SECRET", "x".repeat(31));
    expect(readWebhookConfig()).toBeNull();
  });
});

describe("API surface", () => {
  it("exposes no public notification functions", () => {
    expect(Object.keys(notificationsModule).sort()).toEqual(["deliver", "getDelivery", "recordAttempt"]);
    for (const fn of Object.values(notificationsModule)) {
      expect((fn as { isPublic?: boolean }).isPublic).toBeFalsy();
      expect((fn as { isInternal?: boolean }).isInternal).toBe(true);
    }
  });
});
