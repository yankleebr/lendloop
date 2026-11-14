import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { MAX_OVERDUE_SCAN, MAX_REMINDERS_PER_RUN } from "./lib/automationRules";
import { signWebhook } from "./lib/hmac";
import * as remindersModule from "./reminders";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const TODAY = "2026-11-13";
const YESTERDAY = "2026-11-12";
const NOW_SEC = Math.floor(Date.parse("2026-11-13T12:00:00Z") / 1000);
const INBOUND_SECRET = "i".repeat(64);
const OUTBOUND_SECRET = "o".repeat(64);
const LIST_PATH = "/n8n/v1/overdue-loans";
const REPORT_PATH = "/n8n/v1/reminders";
const LIST_BODY = { version: 1, type: "overdue.list" };

const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", name: "Bob", email: "bob@example.com" };
const DRILL = { name: "Drill", category: "power_tools", condition: "good", description: "" } as const;

let logSpy: Mock;
let warnSpy: Mock;
let errorSpy: Mock;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  vi.stubEnv("N8N_INBOUND_SECRET", INBOUND_SECRET);
  // WF1 events from fixtures end as `not_configured`: never a real fetch.
  vi.stubEnv("N8N_WEBHOOK_URL", "");
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {}) as unknown as Mock;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}) as unknown as Mock;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {}) as unknown as Mock;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Alice owns a Drill; Bob borrows it. */
async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  const bob = t.withIdentity(BOB);
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const toolId = await alice.mutation(api.tools.create, DRILL);
  return { t, alice, bob, aliceId, bobId, toolId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function insertLoan(
  s: Setup,
  fields: Partial<Doc<"loans">> & { startDate: string; endDate: string },
): Promise<Id<"loans">> {
  return s.t.run((ctx) =>
    ctx.db.insert("loans", {
      toolId: s.toolId,
      borrowerId: s.bobId,
      lenderId: s.aliceId,
      status: "approved",
      ...fields,
    }),
  );
}

const overdue = (endDate = "2026-11-10", extra: Partial<Doc<"loans">> = {}) => ({
  startDate: "2026-11-08",
  endDate,
  ...extra,
});

function reminderLogs(s: Setup): Promise<Doc<"automationLogs">[]> {
  return s.t.run((ctx) =>
    ctx.db
      .query("automationLogs")
      .withIndex("by_kind_status", (q) => q.eq("kind", "reminder"))
      .collect(),
  );
}

function allLogs(s: Setup): Promise<Doc<"automationLogs">[]> {
  return s.t.run((ctx) => ctx.db.query("automationLogs").collect());
}

/** Inserts a reminder row directly (e.g. for earlier days). */
function insertReminder(
  s: Setup,
  loanId: Id<"loans">,
  reminderDate: string,
  status: "sent" | "failed" = "sent",
) {
  return s.t.run((ctx) =>
    ctx.db.insert("automationLogs", {
      loanId,
      kind: "reminder",
      event: "loan.overdue",
      recipientId: s.bobId,
      idempotencyKey: `reminder:${loanId}:${reminderDate}`,
      reminderDate,
      status,
      attempts: 1,
      occurredAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

interface PostOptions {
  secret?: string;
  tsOffset?: number;
  signature?: string | null;
  timestamp?: string | null;
  contentType?: string;
  headers?: Record<string, string>;
  /** Sign this body but send `body`. */
  signedBody?: string;
}

/** Signs the raw body like the n8n Crypto node and POSTs it through convex/http.ts. */
async function signedPost(s: Setup, path: string, body: unknown, opts: PostOptions = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const ts = NOW_SEC + (opts.tsOffset ?? 0);
  const signature =
    opts.signature !== undefined
      ? opts.signature
      : await signWebhook(opts.secret ?? INBOUND_SECRET, ts, opts.signedBody ?? raw);
  const timestamp = opts.timestamp !== undefined ? opts.timestamp : String(ts);
  const headers: Record<string, string> = {
    "Content-Type": opts.contentType ?? "application/json",
    ...opts.headers,
  };
  if (timestamp !== null) headers["X-LendLoop-Timestamp"] = timestamp;
  if (signature !== null) headers["X-LendLoop-Signature"] = signature;
  return s.t.fetch(path, { method: "POST", headers, body: raw });
}

function report(loanId: string, extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    type: "reminder.report",
    loanId,
    reminderDate: TODAY,
    status: "sent",
    error: null,
    ...extra,
  };
}

async function listLoans(s: Setup) {
  const response = await signedPost(s, LIST_PATH, LIST_BODY);
  expect(response.status).toBe(200);
  return response.json();
}

describe("authentication (before any read)", () => {
  it.each([
    ["no signature header", { signature: null }],
    ["no timestamp header", { timestamp: null }],
    ["v2= prefix", { signature: `v2=${"0".repeat(64)}` }],
    ["non-hex signature", { signature: `v1=${"z".repeat(64)}` }],
    ["outbound secret", { secret: OUTBOUND_SECRET }],
    ["timestamp 301 s old", { tsOffset: -301 }],
    ["timestamp 301 s ahead", { tsOffset: 301 }],
    ["signature over another body", { signedBody: JSON.stringify({ version: 1, type: "x" }) }],
  ])("%s → 401 with a generic body", async (_label, opts) => {
    const s = await setup();
    const response = await signedPost(s, LIST_PATH, LIST_BODY, opts as PostOptions);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid signature" });
  });

  it.each([-300, 300])("timestamp offset %i s passes", async (tsOffset) => {
    const s = await setup();
    expect((await signedPost(s, LIST_PATH, LIST_BODY, { tsOffset })).status).toBe(200);
  });

  it("bad signature + non-JSON body → 401, not 400", async () => {
    const s = await setup();
    const response = await signedPost(s, REPORT_PATH, "not json", { signature: `v1=${"0".repeat(64)}` });
    expect(response.status).toBe(401);
  });

  it("bad signature + report for a missing loan → 401 (not 404) and no row", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    const before = (await allLogs(s)).length;
    for (const target of [loanId, "missing"]) {
      const response = await signedPost(s, REPORT_PATH, report(target), { secret: OUTBOUND_SECRET });
      expect(response.status).toBe(401);
    }
    expect(await allLogs(s)).toHaveLength(before);
  });

  it.each([
    ["unset", ""],
    ["31 chars", "x".repeat(31)],
  ])("N8N_INBOUND_SECRET %s → 503 even with a signature for it", async (_label, secret) => {
    vi.stubEnv("N8N_INBOUND_SECRET", secret);
    const s = await setup();
    const response = await signedPost(s, LIST_PATH, LIST_BODY, { secret: secret || INBOUND_SECRET });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(warnSpy).toHaveBeenCalledWith("inbound: not_configured");
  });
});

describe("transport", () => {
  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])("%s → 405 with Allow: POST", async (method) => {
    const s = await setup();
    for (const path of [LIST_PATH, REPORT_PATH]) {
      const response = await s.t.fetch(path, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
      expect(await response.json()).toEqual({ error: "method not allowed" });
    }
  });

  it("unknown path → 404", async () => {
    const s = await setup();
    expect((await signedPost(s, "/n8n/v1/unknown", LIST_BODY)).status).toBe(404);
  });

  it("text/plain → 415", async () => {
    const s = await setup();
    const response = await signedPost(s, LIST_PATH, LIST_BODY, { contentType: "text/plain" });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported media type" });
  });

  it("accepts application/json with a charset", async () => {
    const s = await setup();
    const response = await signedPost(s, LIST_PATH, LIST_BODY, {
      contentType: "application/json; charset=utf-8",
    });
    expect(response.status).toBe(200);
  });

  it("a 2,049-byte body → 413, 2,048 passes the size check", async () => {
    const s = await setup();
    const pad = (n: number) => JSON.stringify({ pad: "x".repeat(n - 10) });
    expect(pad(2049)).toHaveLength(2049);
    expect((await signedPost(s, LIST_PATH, pad(2049))).status).toBe(413);
    // valid size, wrong shape → reaches the parser
    expect((await signedPost(s, LIST_PATH, pad(2048))).status).toBe(400);
  });

  it("multi-byte characters count as UTF-8 bytes", async () => {
    const s = await setup();
    const body = JSON.stringify({ pad: "é".repeat(1100) });
    expect(body.length).toBeLessThan(2048);
    expect((await signedPost(s, LIST_PATH, body)).status).toBe(413);
  });

  it("Content-Length over the limit → 413", async () => {
    const s = await setup();
    const response = await signedPost(s, LIST_PATH, LIST_BODY, {
      headers: { "Content-Length": "999999" },
    });
    expect(response.status).toBe(413);
  });

  it.each([
    ["extra key", { ...LIST_BODY, extra: 1 }],
    ["wrong version", { version: 2, type: "overdue.list" }],
    ["wrong type", { version: 1, type: "reminder.report" }],
  ])("list body with %s → 400", async (_label, body) => {
    const s = await setup();
    const response = await signedPost(s, LIST_PATH, body);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe(JSON.stringify({ error: "bad request" }));
  });

  it.each([
    ["extra key", { extra: 1 }],
    ["pending status", { status: "pending" }],
    ["sent with an error", { error: "email_failed" }],
    ["failed without an error", { status: "failed" }],
    ["bad date", { reminderDate: "2026-13-01" }],
    ["65-char loanId", { loanId: "a".repeat(65) }],
  ])("report with %s → 400 without echoing input", async (_label, extra) => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    const response = await signedPost(s, REPORT_PATH, report(loanId, extra));
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toBe(JSON.stringify({ error: "bad request" }));
    expect(await reminderLogs(s)).toHaveLength(0);
  });

  it("valid JSON that is not an object → 400", async () => {
    const s = await setup();
    expect((await signedPost(s, REPORT_PATH, "[]")).status).toBe(400);
    expect((await signedPost(s, REPORT_PATH, "null")).status).toBe(400);
  });
});

describe("overdue list", () => {
  it("includes only approved loans past their end date", async () => {
    const s = await setup();
    const included = await insertLoan(s, overdue());
    await insertLoan(s, overdue(TODAY));
    await insertLoan(s, { startDate: "2026-11-20", endDate: "2026-11-21" });
    for (const status of ["returned", "pending", "rejected", "cancelled"] as const) {
      await insertLoan(s, overdue("2026-11-10", { status }));
    }
    const body = await listLoans(s);
    expect(body).toEqual({
      version: 1,
      today: TODAY,
      truncated: false,
      loans: [
        {
          loanId: included,
          toolName: "Drill",
          borrowerName: "Bob",
          borrowerEmail: BOB.email,
          endDate: "2026-11-10",
          daysOverdue: 3,
        },
      ],
    });
  });

  it("items have exactly the documented keys and no lender data", async () => {
    const s = await setup();
    await insertLoan(s, overdue());
    const response = await signedPost(s, LIST_PATH, LIST_BODY);
    const raw = await response.text();
    const body = JSON.parse(raw);
    expect(Object.keys(body).sort()).toEqual(["loans", "today", "truncated", "version"]);
    expect(Object.keys(body.loans[0]).sort()).toEqual(
      ["borrowerEmail", "borrowerName", "daysOverdue", "endDate", "loanId", "toolName"],
    );
    for (const secret of ["Alice", ALICE.email, s.aliceId, s.bobId, "tokenIdentifier"]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("sends tool and borrower names as single-line text", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.toolId, { name: "Drill\r\nBcc: x@evil.test" });
      await ctx.db.patch(s.bobId, { name: "​\n" });
    });
    await insertLoan(s, overdue());
    const [item] = (await listLoans(s)).loans;
    expect(item.toolName).toBe("Drill Bcc: x@evil.test");
    expect(item.borrowerName).toBe("Neighbor");
  });

  it("warns when the scan is saturated with ineligible loans", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < MAX_OVERDUE_SCAN; i++) {
        const loanId = await ctx.db.insert("loans", {
          toolId: s.toolId,
          borrowerId: s.bobId,
          lenderId: s.aliceId,
          status: "approved",
          ...overdue(),
        });
        await ctx.db.insert("automationLogs", {
          loanId,
          kind: "reminder",
          event: "loan.overdue",
          recipientId: s.bobId,
          idempotencyKey: `reminder:${loanId}:${TODAY}`,
          reminderDate: TODAY,
          status: "sent",
          attempts: 1,
          occurredAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });
    const body = await listLoans(s);
    expect(body).toMatchObject({ loans: [], truncated: true });
    expect(warnSpy).toHaveBeenCalledWith("reminders: overdue scan saturated (0 eligible)");
  });

  it("does not warn on a normal run", async () => {
    const s = await setup();
    await insertLoan(s, overdue());
    await listLoans(s);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("borrower without email → borrowerEmail null", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.bobId, { email: undefined }));
    await insertLoan(s, overdue());
    expect((await listLoans(s)).loans[0].borrowerEmail).toBeNull();
  });

  it("orders by oldest end date first", async () => {
    const s = await setup();
    const newer = await insertLoan(s, overdue("2026-11-12"));
    const older = await insertLoan(s, overdue("2026-11-01", { startDate: "2026-10-30" }));
    const body = await listLoans(s);
    expect(body.loans.map((l: { loanId: string }) => l.loanId)).toEqual([older, newer]);
    expect(body.loans.map((l: { daysOverdue: number }) => l.daysOverdue)).toEqual([12, 1]);
  });

  it(`returns at most ${MAX_REMINDERS_PER_RUN} loans and flags truncation`, async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < MAX_REMINDERS_PER_RUN + 1; i++) {
        await ctx.db.insert("loans", {
          toolId: s.toolId,
          borrowerId: s.bobId,
          lenderId: s.aliceId,
          status: "approved",
          ...overdue(),
        });
      }
    });
    const body = await listLoans(s);
    expect(body.loans).toHaveLength(MAX_REMINDERS_PER_RUN);
    expect(body.truncated).toBe(true);
  });

  it("exactly the limit → not truncated", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < MAX_REMINDERS_PER_RUN; i++) {
        await ctx.db.insert("loans", {
          toolId: s.toolId,
          borrowerId: s.bobId,
          lenderId: s.aliceId,
          status: "approved",
          ...overdue(),
        });
      }
    });
    const body = await listLoans(s);
    expect(body.loans).toHaveLength(MAX_REMINDERS_PER_RUN);
    expect(body.truncated).toBe(false);
  });

  it("skips a sent reminder today, keeps a failed one", async () => {
    const s = await setup();
    const sent = await insertLoan(s, overdue());
    const failed = await insertLoan(s, overdue());
    await insertReminder(s, sent, TODAY, "sent");
    await insertReminder(s, failed, TODAY, "failed");
    const ids = (await listLoans(s)).loans.map((l: { loanId: string }) => l.loanId);
    expect(ids).toEqual([failed]);
  });

  it("caps at 7 reminder days (rows of any status)", async () => {
    const s = await setup();
    const atCap = await insertLoan(s, overdue("2026-11-01", { startDate: "2026-10-30" }));
    const underCap = await insertLoan(s, overdue("2026-11-01", { startDate: "2026-10-30" }));
    for (let day = 5; day <= 11; day++) {
      const date = `2026-11-${String(day).padStart(2, "0")}`;
      await insertReminder(s, atCap, date, day === 5 ? "failed" : "sent");
      if (day > 5) await insertReminder(s, underCap, date);
    }
    const ids = (await listLoans(s)).loans.map((l: { loanId: string }) => l.loanId);
    expect(ids).toEqual([underCap]);
  });

  it("today follows the server UTC clock", async () => {
    const s = await setup();
    vi.setSystemTime(new Date("2026-11-13T23:59:59Z"));
    expect((await signedPost(s, LIST_PATH, LIST_BODY, { tsOffset: 43_199 })).status).toBe(200);
    vi.setSystemTime(new Date("2026-11-14T00:00:01Z"));
    const response = await signedPost(s, LIST_PATH, LIST_BODY, { tsOffset: 43_201 });
    expect((await response.json()).today).toBe("2026-11-14");
  });
});

describe("report / idempotency", () => {
  it("first sent report creates the documented row", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    const response = await signedPost(s, REPORT_PATH, report(loanId));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "sent", duplicate: false });
    const [row] = await reminderLogs(s);
    expect(row).toMatchObject({
      loanId,
      kind: "reminder",
      event: "loan.overdue",
      recipientId: s.bobId,
      idempotencyKey: `reminder:${loanId}:${TODAY}`,
      reminderDate: TODAY,
      status: "sent",
      attempts: 1,
    });
    expect(Math.abs(row.sentAt! - Date.now())).toBeLessThan(1000);
    expect(row.occurredAt).toBe(row.sentAt);
    expect(row.lastError).toBeUndefined();
    expect(row.nextAttemptAt).toBeUndefined();
  });

  it("the same report again → duplicate, one unchanged row", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    await signedPost(s, REPORT_PATH, report(loanId));
    const [before] = await reminderLogs(s);
    const response = await signedPost(s, REPORT_PATH, report(loanId));
    expect(await response.json()).toEqual({ ok: true, status: "sent", duplicate: true });
    expect(await reminderLogs(s)).toEqual([before]);
  });

  it("failed then sent → upgraded, attempts 2, lastError cleared", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    const first = await signedPost(s, REPORT_PATH, report(loanId, { status: "failed", error: "email_failed" }));
    expect(await first.json()).toEqual({ ok: true, status: "failed", duplicate: false });
    expect((await reminderLogs(s))[0]).toMatchObject({ status: "failed", lastError: "email_failed" });
    expect((await reminderLogs(s))[0].sentAt).toBeUndefined();

    const second = await signedPost(s, REPORT_PATH, report(loanId));
    expect(await second.json()).toEqual({ ok: true, status: "sent", duplicate: false });
    const rows = await reminderLogs(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "sent", attempts: 2 });
    expect(rows[0].lastError).toBeUndefined();
    expect(rows[0].sentAt).toBeDefined();
  });

  it("sent then failed → stays sent (duplicate)", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    await signedPost(s, REPORT_PATH, report(loanId));
    const response = await signedPost(s, REPORT_PATH, report(loanId, { status: "failed", error: "no_email" }));
    expect(await response.json()).toEqual({ ok: true, status: "sent", duplicate: true });
    expect((await reminderLogs(s))[0]).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("failed + failed → attempts 2, latest lastError", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    await signedPost(s, REPORT_PATH, report(loanId, { status: "failed", error: "no_email" }));
    await signedPost(s, REPORT_PATH, report(loanId, { status: "failed", error: "email_failed" }));
    const rows = await reminderLogs(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", attempts: 2, lastError: "email_failed" });
  });

  it("reminderDate yesterday is accepted; 2 days ago or tomorrow → 400", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue("2026-11-05", { startDate: "2026-11-04" }));
    expect((await signedPost(s, REPORT_PATH, report(loanId, { reminderDate: YESTERDAY }))).status).toBe(200);
    for (const reminderDate of ["2026-11-11", "2026-11-14"]) {
      const response = await signedPost(s, REPORT_PATH, report(loanId, { reminderDate }));
      expect(response.status, reminderDate).toBe(400);
    }
    expect(await reminderLogs(s)).toHaveLength(1);
  });

  it("unknown id or another table's id → 404", async () => {
    const s = await setup();
    for (const loanId of ["doesnotexist", s.toolId, s.bobId]) {
      const response = await signedPost(s, REPORT_PATH, report(loanId));
      expect(response.status, loanId).toBe(404);
      expect(await response.json()).toEqual({ error: "not found" });
    }
  });

  it("deleted loan → 404", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    await s.t.run((ctx) => ctx.db.delete(loanId));
    expect((await signedPost(s, REPORT_PATH, report(loanId))).status).toBe(404);
  });

  it.each([
    ["pending", overdue("2026-11-10", { status: "pending" })],
    ["approved ending today", overdue(TODAY)],
    ["returned before the day", overdue("2026-11-10", { status: "returned", returnedAt: Date.parse("2026-11-12T10:00:00Z") })],
  ])("%s → 409 and no row", async (_label, fields) => {
    const s = await setup();
    const loanId = await insertLoan(s, fields);
    const response = await signedPost(s, REPORT_PATH, report(loanId));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not overdue" });
    expect(await reminderLogs(s)).toHaveLength(0);
  });

  it("returned on the reminder day → 200", async () => {
    const s = await setup();
    const loanId = await insertLoan(
      s,
      overdue("2026-11-10", { status: "returned", returnedAt: Date.parse("2026-11-13T11:00:00Z") }),
    );
    expect((await signedPost(s, REPORT_PATH, report(loanId))).status).toBe(200);
  });

  it("concurrent reports for the same key → one row", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    const args = { loanId, reminderDate: TODAY, status: "sent" as const, error: null, today: TODAY };
    await Promise.all([
      s.t.mutation(internal.reminders.recordReminder, args),
      s.t.mutation(internal.reminders.recordReminder, args),
    ]);
    expect(await reminderLogs(s)).toHaveLength(1);
  });
});

describe("coexistence with notifications", () => {
  it("a reminder row is never delivered and notification rows stay unchanged", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "https://n8n.test/webhook/x");
    vi.stubEnv("N8N_WEBHOOK_SECRET", OUTBOUND_SECRET);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    const notificationId = await s.t.run((ctx) =>
      ctx.db.insert("automationLogs", {
        loanId,
        kind: "notification",
        event: "loan.approved",
        recipientId: s.bobId,
        idempotencyKey: `notification:${loanId}:loan.approved`,
        status: "sent",
        attempts: 1,
        occurredAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const notification = await s.t.run((ctx) => ctx.db.get(notificationId));

    await signedPost(s, REPORT_PATH, report(loanId, { status: "failed", error: "email_failed" }));
    const [reminder] = await reminderLogs(s);
    // force a "pending" reminder to prove the kind guard, not the status guard
    await s.t.run((ctx) => ctx.db.patch(reminder._id, { status: "pending" }));

    expect(await s.t.query(internal.notifications.getDelivery, { logId: reminder._id })).toBeNull();
    await s.t.action(internal.notifications.deliver, { logId: reminder._id });
    await s.t.mutation(internal.notifications.recordAttempt, {
      logId: reminder._id,
      outcome: { kind: "sent", statusCode: 200 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await s.t.run((ctx) => ctx.db.get(reminder._id))).toEqual({ ...reminder, status: "pending" });
    expect(await s.t.run((ctx) => ctx.db.get(notificationId))).toEqual(notification);
  });

  it("notification flow still works next to reminder rows", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    const kinds = (await allLogs(s)).map((r) => [r.kind, r.event, r.loanId]);
    expect(kinds).toEqual([["notification", "loan.requested", loanId]]);
  });
});

describe("logging and API surface", () => {
  it("logs ids and codes only — never secrets, signatures, names or emails", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, overdue());
    await listLoans(s);
    await signedPost(s, REPORT_PATH, report(loanId));
    await signedPost(s, REPORT_PATH, report(loanId), { signature: `v1=${"0".repeat(64)}` });
    const lines = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls].map((a) =>
      a.join(" "),
    );
    expect(lines.some((line) => line.includes(`reminders.record: ${loanId} ${TODAY} -> sent`))).toBe(true);
    for (const line of lines) {
      for (const secret of [INBOUND_SECRET, "v1=", "Bob", BOB.email, "Alice"]) {
        expect(line).not.toContain(secret);
      }
    }
  });

  it("exposes no public reminder functions", () => {
    expect(Object.keys(remindersModule).sort()).toEqual(["listOverdueForReminders", "recordReminder"]);
    for (const fn of Object.values(remindersModule)) {
      expect((fn as { isPublic?: boolean }).isPublic).toBeFalsy();
      expect((fn as { isInternal?: boolean }).isInternal).toBe(true);
    }
  });
});
