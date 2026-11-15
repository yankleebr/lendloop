import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { AppErrorData } from "./lib/errors";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const TODAY = "2026-11-12";
const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", name: "Bob", email: "bob@example.com" };
const CAROL = { subject: "user_carol", name: "Carol", email: "carol@example.com" };
const DAVE = { subject: "user_dave", name: "Dave", email: "dave@example.com" };
const DRILL = { name: "Drill", category: "power_tools", condition: "good", description: "" } as const;

const PARTY_KEYS = ["at", "audience", "event", "key", "kind", "reason", "status"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  // Real loan events end as `failed` / `not_configured`: never a real fetch.
  vi.stubEnv("N8N_WEBHOOK_URL", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<AppErrorData>).data.code;
  }
  throw new Error("Expected promise to reject");
}

/** Alice lends a Drill to Bob; Dave is unrelated; Carol is an admin (not a party). */
async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  const bob = t.withIdentity(BOB);
  const carol = t.withIdentity(CAROL);
  const dave = t.withIdentity(DAVE);
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const carolId = await carol.mutation(api.users.store, {});
  await dave.mutation(api.users.store, {});
  await t.mutation(internal.users.setRole, { userId: carolId, role: "admin" });
  const drillId = await alice.mutation(api.tools.create, DRILL);
  const loanId = await insertLoan(t, { toolId: drillId, borrowerId: bobId, lenderId: aliceId });
  return { t, alice, bob, carol, dave, aliceId, bobId, drillId, loanId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function insertLoan(
  t: Setup["t"],
  ids: Pick<Doc<"loans">, "toolId" | "borrowerId" | "lenderId">,
  fields: Partial<Doc<"loans">> = {},
): Promise<Id<"loans">> {
  return t.run((ctx) =>
    ctx.db.insert("loans", {
      ...ids,
      startDate: "2026-11-05",
      endDate: "2026-11-10",
      status: "approved",
      ...fields,
    }),
  );
}

/** Inserts a log row one second after the previous one (controls _creationTime order). */
async function insertLog(
  s: Setup,
  overrides: Partial<Doc<"automationLogs">> = {},
  loanId: Id<"loans"> = s.loanId,
): Promise<Id<"automationLogs">> {
  vi.advanceTimersByTime(1_000);
  const now = Date.now();
  const event = overrides.event ?? "loan.requested";
  return await s.t.run((ctx) =>
    ctx.db.insert("automationLogs", {
      loanId,
      kind: "notification",
      event,
      recipientId: s.aliceId,
      idempotencyKey: `notification:${loanId}:${event}:${now}`,
      status: "sent",
      attempts: 1,
      occurredAt: now,
      updatedAt: now,
      sentAt: now,
      ...overrides,
    }),
  );
}

const forLoan = (who: Setup["bob"], loanId: Id<"loans">) =>
  who.query(api.activity.forLoan, { loanId });

describe("authorization", () => {
  it("rejects visitors and identities without a users row", async () => {
    const s = await setup();
    expect(await errorCode(forLoan(s.t, s.loanId))).toBe("UNAUTHENTICATED");
    const ghost = s.t.withIdentity({ subject: "user_ghost" });
    expect(await errorCode(forLoan(ghost, s.loanId))).toBe("UNAUTHENTICATED");
  });

  it("forbids unrelated users and non-party admins without leaking loan data", async () => {
    const s = await setup();
    await insertLog(s);
    for (const who of [s.dave, s.carol]) {
      const err = await forLoan(who, s.loanId).catch((e: unknown) => e);
      expect((err as ConvexError<AppErrorData>).data.code).toBe("FORBIDDEN");
      expect(JSON.stringify((err as ConvexError<AppErrorData>).data)).not.toContain(s.loanId);
    }
  });

  it("an admin who is a party gets the party DTO", async () => {
    const s = await setup();
    const carolId = await s.carol.mutation(api.users.store, {});
    const loanId = await insertLoan(s.t, { toolId: s.drillId, borrowerId: carolId, lenderId: s.aliceId });
    await insertLog(s, { recipientId: carolId, status: "failed", lastError: "no_email" }, loanId);
    const [entry] = await forLoan(s.carol, loanId);
    expect(Object.keys(entry).sort()).toEqual(PARTY_KEYS);
    expect(entry).toMatchObject({ audience: "borrower", reason: "no_email" });
  });

  it("NOT_FOUND for a deleted loan", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.delete(s.loanId));
    expect(await errorCode(forLoan(s.bob, s.loanId))).toBe("NOT_FOUND");
  });

  it("both parties see the same entries", async () => {
    const s = await setup();
    await insertLog(s, { event: "loan.requested", recipientId: s.aliceId });
    await insertLog(s, { event: "loan.approved", recipientId: s.bobId });
    const fromBob = await forLoan(s.bob, s.loanId);
    const fromAlice = await forLoan(s.alice, s.loanId);
    expect(fromBob.map((i) => [i.key, i.audience])).toEqual([
      ["loan.approved", "borrower"],
      ["loan.requested", "lender"],
    ]);
    expect(fromAlice.map((i) => [i.key, i.audience])).toEqual(fromBob.map((i) => [i.key, i.audience]));
  });
});

describe("visibility of failure reasons", () => {
  it("no_email is shown only to the recipient", async () => {
    const s = await setup();
    await insertLog(s, { event: "loan.approved", recipientId: s.bobId, status: "failed", lastError: "no_email" });
    await insertLog(s, { event: "loan.returned", recipientId: s.aliceId, status: "failed", lastError: "no_email" });
    const byKey = async (who: Setup["bob"]) =>
      Object.fromEntries((await forLoan(who, s.loanId)).map((i) => [i.key, i.reason]));
    expect(await byKey(s.bob)).toEqual({ "loan.approved": "no_email", "loan.returned": "delivery_failed" });
    expect(await byKey(s.alice)).toEqual({ "loan.approved": "delivery_failed", "loan.returned": "no_email" });
  });

  it.each(["email_failed", "not_configured", "http_401", "timeout", "event_budget"])(
    "%s → delivery_failed for both parties",
    async (lastError) => {
      const s = await setup();
      await insertLog(s, { recipientId: s.bobId, status: "failed", lastError });
      expect((await forLoan(s.bob, s.loanId))[0].reason).toBe("delivery_failed");
      expect((await forLoan(s.alice, s.loanId))[0].reason).toBe("delivery_failed");
    },
  );

  it("pending rows carry no reason", async () => {
    const s = await setup();
    await insertLog(s, { status: "pending", attempts: 2, lastError: "http_500", sentAt: undefined });
    expect((await forLoan(s.alice, s.loanId))[0]).toMatchObject({ status: "retrying", reason: null });
  });
});

describe("DTO", () => {
  it("exposes only the projected keys and no internal identifiers", async () => {
    const s = await setup();
    const logId = await insertLog(s, {
      status: "failed",
      lastError: "http_500",
      lastStatusCode: 500,
      nextAttemptAt: 123,
    });
    const log = (await s.t.run((ctx) => ctx.db.get(logId)))!;
    const result = await forLoan(s.bob, s.loanId);
    expect(Object.keys(result[0]).sort()).toEqual(PARTY_KEYS);
    const json = JSON.stringify(result);
    for (const secret of [log.idempotencyKey, log.recipientId, logId, s.loanId, "http_500"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("maps audience, key, status and timestamp", async () => {
    const s = await setup();
    await insertLog(s, {
      kind: "reminder",
      event: "loan.overdue",
      recipientId: s.bobId,
      reminderDate: "2026-11-11",
    });
    await insertLog(s, { event: "loan.requested", status: "pending", attempts: 0, sentAt: undefined, occurredAt: 5, updatedAt: 6 });
    await insertLog(s, { event: "loan.approved", recipientId: s.bobId, status: "failed", occurredAt: 5, updatedAt: 7, sentAt: undefined });
    await insertLog(s, { event: "loan.returned", recipientId: s.bobId, status: "sent", occurredAt: 5, updatedAt: 6, sentAt: 8 });
    const items = await forLoan(s.bob, s.loanId);
    expect(items.map(({ key, audience, status, at }) => ({ key, audience, status, at }))).toEqual([
      { key: "loan.returned", audience: "borrower", status: "sent", at: 8 },
      { key: "loan.approved", audience: "borrower", status: "failed", at: 7 },
      { key: "loan.requested", audience: "lender", status: "sending", at: 5 },
      { key: "overdue:2026-11-11", audience: "borrower", status: "sent", at: expect.any(Number) },
    ]);
  });
});

describe("order and bound", () => {
  it("returns newest first", async () => {
    const s = await setup();
    const events = ["loan.requested", "loan.approved", "loan.returned"] as const;
    for (const event of events) await insertLog(s, { event });
    for (const day of ["2026-11-11", "2026-11-12"]) {
      await insertLog(s, { kind: "reminder", event: "loan.overdue", recipientId: s.bobId, reminderDate: day });
    }
    const keys = (await forLoan(s.bob, s.loanId)).map((i) => i.key);
    expect(keys).toEqual([
      "overdue:2026-11-12",
      "overdue:2026-11-11",
      "loan.returned",
      "loan.approved",
      "loan.requested",
    ]);
  });

  it("caps at the newest 10 rows", async () => {
    const s = await setup();
    for (let i = 1; i <= 12; i++) {
      await insertLog(s, { kind: "reminder", event: "loan.overdue", recipientId: s.bobId, reminderDate: `d${i}` });
    }
    const keys = (await forLoan(s.bob, s.loanId)).map((i) => i.key);
    expect(keys).toEqual(Array.from({ length: 10 }, (_, i) => `overdue:d${12 - i}`));
  });

  it("never includes rows of another loan", async () => {
    const s = await setup();
    const otherLoan = await insertLoan(s.t, { toolId: s.drillId, borrowerId: s.bobId, lenderId: s.aliceId });
    await insertLog(s, { event: "loan.approved" }, otherLoan);
    expect(await forLoan(s.bob, s.loanId)).toEqual([]);
    expect(await forLoan(s.bob, otherLoan)).toHaveLength(1);
  });
});

describe("real flow", () => {
  it("request + approve show up as two failed notifications", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, {
      toolId: s.drillId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    vi.advanceTimersByTime(1_000);
    await s.alice.mutation(api.loans.approve, { loanId });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const items = await forLoan(s.bob, loanId);
    expect(items.map(({ key, audience, status, reason }) => ({ key, audience, status, reason }))).toEqual([
      { key: "loan.approved", audience: "borrower", status: "failed", reason: "delivery_failed" },
      { key: "loan.requested", audience: "lender", status: "failed", reason: "delivery_failed" },
    ]);
  });

  it("a recorded reminder appears as reminder / loan.overdue / sent", async () => {
    const s = await setup();
    const result = await s.t.mutation(internal.reminders.recordReminder, {
      loanId: s.loanId,
      reminderDate: TODAY,
      status: "sent",
      error: null,
      today: TODAY,
    });
    expect(result).toMatchObject({ result: "recorded" });
    expect(await forLoan(s.bob, s.loanId)).toEqual([
      {
        key: `overdue:${TODAY}`,
        kind: "reminder",
        event: "loan.overdue",
        audience: "borrower",
        status: "sent",
        at: expect.any(Number),
        reason: null,
      },
    ]);
  });
});
