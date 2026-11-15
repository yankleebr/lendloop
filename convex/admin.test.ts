import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as adminModule from "./admin";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ADMIN_PAGE_MAX, ADMIN_PAGE_SIZE } from "./lib/adminRules";
import type { AppErrorData } from "./lib/errors";
import { LOAN_STATUSES, type AdminLoanFilter, type LoanStatus } from "./lib/validators";
import schema from "./schema";
import * as usersModule from "./users";

const modules = import.meta.glob("./**/*.ts");

const TODAY = "2026-11-12";
const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", name: "Bob", email: "bob@example.com" };
const CAROL = { subject: "user_carol", name: "Carol", email: "carol@example.com" };

const DRILL = { name: "Drill", category: "power_tools", condition: "good", description: "" } as const;
const SAW = { name: "Saw", category: "hand_tools", condition: "fair", description: "" } as const;

const PUBLIC_USER_KEYS = ["_id", "isTrustedLender", "name"];
const FIRST_PAGE = { numItems: 20, cursor: null };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  // Scheduled notification deliveries end as `not_configured`: never a real fetch.
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

/** Alice owns a Drill and a Saw; Bob is a borrower; Carol is an admin. */
async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(ALICE);
  const bob = t.withIdentity(BOB);
  const carol = t.withIdentity(CAROL);
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const carolId = await carol.mutation(api.users.store, {});
  await t.mutation(internal.users.setRole, { userId: carolId, role: "admin" });
  const drillId = await alice.mutation(api.tools.create, DRILL);
  const sawId = await alice.mutation(api.tools.create, SAW);
  return { t, alice, bob, carol, aliceId, bobId, carolId, drillId, sawId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Inserts a loan directly (bypassing request rules). Bob borrows from Alice by default. */
function insertLoan(
  s: Setup,
  fields: Partial<Doc<"loans">> & { startDate: string; endDate: string; status: LoanStatus },
): Promise<Id<"loans">> {
  return s.t.run((ctx) =>
    ctx.db.insert("loans", { toolId: s.drillId, borrowerId: s.bobId, lenderId: s.aliceId, ...fields }),
  );
}

const get = <T extends "tools" | "loans" | "users">(s: Setup, id: Id<T>) =>
  s.t.run((ctx) => ctx.db.get(id));

describe("guards", () => {
  it("every admin function rejects signed-out callers and plain users", async () => {
    const s = await setup();
    type Caller = typeof s.alice;
    const calls = [
      (c: Caller) => c.mutation(api.admin.removeTool, { toolId: s.drillId }),
      (c: Caller) =>
        c.query(api.admin.listLoans, { filter: "all", today: TODAY, paginationOpts: FIRST_PAGE }),
      (c: Caller) => c.query(api.admin.listUsers, { paginationOpts: FIRST_PAGE }),
      (c: Caller) =>
        c.mutation(api.admin.setTrustedLender, { userId: s.aliceId, isTrusted: true }),
      async (c: Caller) =>
        c.query(api.admin.loanActivity, {
          loanId: await insertLoan(s, { startDate: TODAY, endDate: TODAY, status: "pending" }),
        }),
    ];
    for (const call of calls) {
      expect(await errorCode(call(s.t))).toBe("UNAUTHENTICATED");
      expect(await errorCode(call(s.alice))).toBe("FORBIDDEN");
      expect(await errorCode(call(s.bob))).toBe("FORBIDDEN");
    }
    expect(await get(s, s.drillId)).toMatchObject({ isActive: true });
    expect(await get(s, s.aliceId)).toMatchObject({ isTrustedLender: false });
  });

  it("rejects an identity without a users row", async () => {
    const s = await setup();
    const ghost = s.t.withIdentity({ subject: "user_ghost" });
    expect(await errorCode(ghost.query(api.admin.listUsers, { paginationOpts: FIRST_PAGE }))).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("checks the role before validating arguments", async () => {
    const s = await setup();
    expect(
      await errorCode(
        s.bob.query(api.admin.listLoans, { filter: "all", today: "bad", paginationOpts: FIRST_PAGE }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("admin.removeTool", () => {
  it("removes another user's tool, records who removed it and auto-rejects pending", async () => {
    const s = await setup();
    const pending = await s.bob.mutation(api.loans.request, {
      toolId: s.drillId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    await s.carol.mutation(api.admin.removeTool, { toolId: s.drillId });

    const tool = await get(s, s.drillId);
    expect(tool).toMatchObject({ isActive: false, removedBy: s.carolId });
    expect(typeof tool?.removedAt).toBe("number");
    const loan = await get(s, pending);
    expect(loan).toMatchObject({ status: "rejected", closeReason: "tool_removed" });
    expect(typeof loan?.decidedAt).toBe("number");
    expect((await s.bob.query(api.tools.list, {})).map((i) => i.name)).toEqual(["Saw"]);
  });

  it("is blocked by an approved loan (started or future)", async () => {
    for (const startDate of ["2026-11-10", "2026-12-01"]) {
      const s = await setup();
      const approved = await insertLoan(s, { startDate, endDate: "2026-12-05", status: "approved" });
      const pending = await insertLoan(s, {
        startDate: "2026-12-10",
        endDate: "2026-12-11",
        status: "pending",
      });
      expect(await errorCode(s.carol.mutation(api.admin.removeTool, { toolId: s.drillId }))).toBe(
        "CONFLICT",
      );
      expect(await get(s, s.drillId)).toMatchObject({ isActive: true });
      expect(await get(s, s.drillId)).not.toHaveProperty("removedBy");
      expect((await get(s, approved))?.status).toBe("approved");
      expect((await get(s, pending))?.status).toBe("pending");
    }
  });

  it("returns NOT_FOUND for removed or unknown tools", async () => {
    const s = await setup();
    await s.carol.mutation(api.admin.removeTool, { toolId: s.drillId });
    expect(await errorCode(s.carol.mutation(api.admin.removeTool, { toolId: s.drillId }))).toBe(
      "NOT_FOUND",
    );
    await s.t.run((ctx) => ctx.db.delete(s.sawId));
    expect(await errorCode(s.carol.mutation(api.admin.removeTool, { toolId: s.sawId }))).toBe(
      "NOT_FOUND",
    );
  });

  it("lets the admin remove their own tool", async () => {
    const s = await setup();
    const own = await s.carol.mutation(api.tools.create, DRILL);
    await s.carol.mutation(api.admin.removeTool, { toolId: own });
    expect(await get(s, own)).toMatchObject({ isActive: false, removedBy: s.carolId });
  });

  it("does not open tools.remove to admins", async () => {
    const s = await setup();
    expect(await errorCode(s.carol.mutation(api.tools.remove, { toolId: s.drillId }))).toBe(
      "FORBIDDEN",
    );
  });
});

describe("admin.listLoans", () => {
  /** One loan per status (oldest first), plus an overdue one and one ending today. */
  async function seedLoans(s: Setup) {
    const ids: Record<string, Id<"loans">> = {};
    for (const status of LOAN_STATUSES) {
      ids[status] = await insertLoan(s, {
        status,
        toolId: status === "returned" ? s.sawId : s.drillId,
        startDate: "2026-11-20",
        endDate: "2026-11-21",
      });
    }
    ids.overdueOld = await insertLoan(s, {
      status: "approved",
      toolId: s.sawId,
      startDate: "2026-11-01",
      endDate: "2026-11-02",
    });
    ids.overdueNew = await insertLoan(s, {
      status: "approved",
      toolId: s.sawId,
      startDate: "2026-11-05",
      endDate: "2026-11-11",
    });
    ids.endsToday = await insertLoan(s, {
      status: "approved",
      toolId: s.sawId,
      startDate: "2026-11-10",
      endDate: TODAY,
    });
    return ids;
  }

  const list = (s: Setup, filter: AdminLoanFilter, numItems = 20) =>
    s.carol.query(api.admin.listLoans, {
      filter,
      today: TODAY,
      paginationOpts: { numItems, cursor: null },
    });

  it("returns every loan newest first with both parties as publicUser", async () => {
    const s = await setup();
    const ids = await seedLoans(s);
    const result = await list(s, "all");
    expect(result.isDone).toBe(true);
    expect(result.page.map((l) => l._id)).toEqual(
      [
        ids.pending,
        ids.approved,
        ids.rejected,
        ids.cancelled,
        ids.returned,
        ids.overdueOld,
        ids.overdueNew,
        ids.endsToday,
      ].reverse(),
    );
    const item = result.page[0];
    expect(Object.keys(item).sort()).toEqual(
      [
        "_creationTime",
        "_id",
        "borrower",
        "endDate",
        "isOverdue",
        "lender",
        "startDate",
        "status",
        "tool",
      ].sort(),
    );
    expect(Object.keys(item.borrower).sort()).toEqual(PUBLIC_USER_KEYS);
    expect(Object.keys(item.lender).sort()).toEqual(PUBLIC_USER_KEYS);
    expect(item).toMatchObject({
      borrower: { _id: s.bobId, name: "Bob" },
      lender: { _id: s.aliceId, name: "Alice" },
    });
  });

  it("filters by each status, newest first", async () => {
    const s = await setup();
    const ids = await seedLoans(s);
    for (const status of LOAN_STATUSES) {
      const page = (await list(s, status)).page;
      expect(page.every((l) => l.status === status)).toBe(true);
    }
    expect((await list(s, "approved")).page.map((l) => l._id)).toEqual([
      ids.endsToday,
      ids.overdueNew,
      ids.overdueOld,
      ids.approved,
    ]);
    expect((await list(s, "pending")).page.map((l) => l._id)).toEqual([ids.pending]);
  });

  it("overdue returns approved loans past their end date, most overdue first", async () => {
    const s = await setup();
    const ids = await seedLoans(s);
    const page = (await list(s, "overdue")).page;
    expect(page.map((l) => l._id)).toEqual([ids.overdueOld, ids.overdueNew]);
    expect(page.every((l) => l.isOverdue)).toBe(true);
    const all = (await list(s, "all")).page;
    expect(all.find((l) => l._id === ids.endsToday)?.isOverdue).toBe(false);
  });

  it("paginates with a cursor and no duplicates", async () => {
    const s = await setup();
    await seedLoans(s);
    const first = await list(s, "all", 3);
    expect(first.page).toHaveLength(3);
    expect(first.isDone).toBe(false);
    const rest = await s.carol.query(api.admin.listLoans, {
      filter: "all",
      today: TODAY,
      paginationOpts: { numItems: 20, cursor: first.continueCursor },
    });
    expect(rest.isDone).toBe(true);
    const ids = [...first.page, ...rest.page].map((l) => l._id);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
  });

  it("clamps numItems to ADMIN_PAGE_MAX", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < ADMIN_PAGE_MAX + 5; i++) {
        await ctx.db.insert("loans", {
          toolId: s.drillId,
          borrowerId: s.bobId,
          lenderId: s.aliceId,
          status: "rejected",
          startDate: "2026-11-20",
          endDate: "2026-11-20",
        });
      }
    });
    const result = await list(s, "all", 500);
    expect(result.page.length).toBeLessThanOrEqual(ADMIN_PAGE_MAX);
    expect(result.isDone).toBe(false);
    expect((await list(s, "all", Number.NaN)).page).toHaveLength(ADMIN_PAGE_SIZE);
    expect((await list(s, "all", 0)).page).toHaveLength(1);
  });

  it("keeps the tool name after removal and rejects a bad today", async () => {
    const s = await setup();
    await insertLoan(s, { status: "rejected", startDate: "2026-11-20", endDate: "2026-11-20" });
    await s.carol.mutation(api.admin.removeTool, { toolId: s.drillId });
    const page = (await list(s, "all")).page;
    expect(page[0].tool).toMatchObject({ name: "Drill", isActive: false });
    expect(
      await errorCode(
        s.carol.query(api.admin.listLoans, {
          filter: "all",
          today: "2026-13-01",
          paginationOpts: FIRST_PAGE,
        }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
});

describe("admin.listUsers", () => {
  it("returns users newest first without email or tokenIdentifier", async () => {
    const s = await setup();
    const result = await s.carol.query(api.admin.listUsers, { paginationOpts: FIRST_PAGE });
    expect(result.page.map((u) => u.name)).toEqual(["Carol", "Bob", "Alice"]);
    for (const user of result.page) {
      expect(Object.keys(user).sort()).toEqual(
        ["_creationTime", "_id", "isMe", "isTrustedLender", "name", "role"].sort(),
      );
    }
    expect(result.page.map((u) => u.isMe)).toEqual([true, false, false]);
    expect(result.page[0].role).toBe("admin");
  });

  it("paginates with a cursor", async () => {
    const s = await setup();
    const first = await s.carol.query(api.admin.listUsers, {
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const rest = await s.carol.query(api.admin.listUsers, {
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(rest.page.map((u) => u.name)).toEqual(["Alice"]);
  });
});

describe("admin.setTrustedLender", () => {
  it("sets and unsets idempotently without touching role", async () => {
    const s = await setup();
    const set = (isTrusted: boolean) =>
      s.carol.mutation(api.admin.setTrustedLender, { userId: s.aliceId, isTrusted });
    await set(true);
    expect(await get(s, s.aliceId)).toMatchObject({ isTrustedLender: true, role: "user" });
    await set(true);
    expect(await get(s, s.aliceId)).toMatchObject({ isTrustedLender: true, role: "user" });
    await set(false);
    expect(await get(s, s.aliceId)).toMatchObject({ isTrustedLender: false, role: "user" });
  });

  it("returns NOT_FOUND for an unknown user and rejects a role argument", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.delete(s.bobId));
    expect(
      await errorCode(
        s.carol.mutation(api.admin.setTrustedLender, { userId: s.bobId, isTrusted: true }),
      ),
    ).toBe("NOT_FOUND");
    await expect(
      s.carol.mutation(api.admin.setTrustedLender, {
        userId: s.aliceId,
        isTrusted: true,
        role: "admin",
      } as unknown as { userId: Id<"users">; isTrusted: boolean }),
    ).rejects.toThrow();
    expect(await get(s, s.aliceId)).toMatchObject({ isTrustedLender: false, role: "user" });
  });
});

describe("Trusted Lender in projections", () => {
  it("shows the flag wherever the lender appears; listPublic unchanged", async () => {
    const s = await setup();
    const bobsTool = await s.bob.mutation(api.tools.create, { ...DRILL, name: "Ladder" });
    await s.bob.mutation(api.loans.request, {
      toolId: s.drillId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    await s.carol.mutation(api.admin.setTrustedLender, { userId: s.aliceId, isTrusted: true });

    const board = await s.bob.query(api.tools.list, {});
    for (const item of board) {
      expect(item.owner.isTrustedLender).toBe(item._id !== bobsTool);
    }
    const mine = await s.bob.query(api.loans.listMyRequests, { today: TODAY });
    expect(mine[0].lender.isTrustedLender).toBe(true);
    const all = await s.carol.query(api.admin.listLoans, {
      filter: "all",
      today: TODAY,
      paginationOpts: FIRST_PAGE,
    });
    expect(all.page[0].lender.isTrustedLender).toBe(true);
    expect(all.page[0].borrower.isTrustedLender).toBe(false);

    const visitors = await s.t.query(api.tools.listPublic, {});
    for (const item of visitors) {
      expect(Object.keys(item).sort()).toEqual(["_id", "category", "name"]);
    }
  });
});

describe("missing users in projections", () => {
  it("fall back to a placeholder that satisfies publicUser (isTrustedLender false)", async () => {
    const s = await setup();
    await s.carol.mutation(api.admin.setTrustedLender, { userId: s.aliceId, isTrusted: true });
    await insertLoan(s, { status: "pending", startDate: "2026-11-20", endDate: "2026-11-21" });
    await s.t.run(async (ctx) => {
      await ctx.db.delete(s.aliceId);
      await ctx.db.delete(s.bobId);
    });
    const placeholder = (id: Id<"users">) => ({ _id: id, name: "Neighbor", isTrustedLender: false });

    const loans = await s.carol.query(api.admin.listLoans, {
      filter: "all",
      today: TODAY,
      paginationOpts: FIRST_PAGE,
    });
    expect(loans.page[0].lender).toEqual(placeholder(s.aliceId));
    expect(loans.page[0].borrower).toEqual(placeholder(s.bobId));

    const board = await s.carol.query(api.tools.list, {});
    for (const item of board) expect(item.owner).toEqual(placeholder(s.aliceId));
  });
});

describe("admin as a normal user", () => {
  it("follows the same loan rules as anyone else", async () => {
    const s = await setup();
    const carolsLoan = await s.carol.mutation(api.loans.request, {
      toolId: s.drillId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    const bobsLoan = await s.bob.mutation(api.loans.request, {
      toolId: s.sawId,
      startDate: "2026-11-20",
      endDate: "2026-11-21",
    });
    const approved = await insertLoan(s, {
      status: "approved",
      startDate: "2026-12-01",
      endDate: "2026-12-02",
    });

    for (const loanId of [carolsLoan, bobsLoan]) {
      expect(await errorCode(s.carol.mutation(api.loans.approve, { loanId }))).toBe("FORBIDDEN");
      expect(await errorCode(s.carol.mutation(api.loans.reject, { loanId }))).toBe("FORBIDDEN");
    }
    expect(await errorCode(s.carol.mutation(api.loans.markReturned, { loanId: approved }))).toBe(
      "FORBIDDEN",
    );
    expect(await errorCode(s.carol.mutation(api.loans.cancel, { loanId: bobsLoan }))).toBe(
      "FORBIDDEN",
    );

    const mine = await s.carol.query(api.loans.listMyRequests, { today: TODAY });
    expect(mine.map((l) => l._id)).toEqual([carolsLoan]);
    expect(await s.carol.query(api.loans.listIncoming, { today: TODAY })).toEqual([]);

    const own = await s.carol.mutation(api.tools.create, { ...DRILL, name: "Carol's drill" });
    expect(
      await errorCode(
        s.carol.mutation(api.loans.request, {
          toolId: own,
          startDate: "2026-11-20",
          endDate: "2026-11-21",
        }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("loanActivity", () => {
  async function withLog(s: Setup, fields: Partial<Doc<"automationLogs">>) {
    const loanId = await insertLoan(s, { startDate: TODAY, endDate: TODAY, status: "approved" });
    await s.t.run((ctx) =>
      ctx.db.insert("automationLogs", {
        loanId,
        kind: "notification",
        event: "loan.approved",
        recipientId: s.bobId,
        idempotencyKey: `notification:${loanId}:loan.approved`,
        status: "failed",
        attempts: 1,
        occurredAt: 1,
        updatedAt: 2,
        ...fields,
      }),
    );
    return loanId;
  }

  it("rejects visitors and parties who are not admins", async () => {
    const s = await setup();
    const loanId = await withLog(s, {});
    expect(await errorCode(s.t.query(api.admin.loanActivity, { loanId }))).toBe("UNAUTHENTICATED");
    expect(await errorCode(s.bob.query(api.admin.loanActivity, { loanId }))).toBe("FORBIDDEN");
    expect(await errorCode(s.alice.query(api.admin.loanActivity, { loanId }))).toBe("FORBIDDEN");
    const ghost = s.t.withIdentity({ subject: "user_ghost" });
    expect(await errorCode(ghost.query(api.admin.loanActivity, { loanId }))).toBe("UNAUTHENTICATED");
  });

  it("never leaks internal identifiers or raw codes", async () => {
    const s = await setup();
    const loanId = await withLog(s, { lastError: "http_503", lastStatusCode: 503, nextAttemptAt: 99 });
    const log = (await s.t.run((ctx) => ctx.db.query("automationLogs").first()))!;
    const json = JSON.stringify(await s.carol.query(api.admin.loanActivity, { loanId }));
    for (const secret of [log.idempotencyKey, log.recipientId, log._id, loanId, "http_503", "503", "99"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("caps at the newest 10 rows; pending with no attempt is sending", async () => {
    const s = await setup();
    const loanId = await withLog(s, { status: "pending", attempts: 0 });
    for (let i = 1; i <= 11; i++) {
      await s.t.run((ctx) =>
        ctx.db.insert("automationLogs", {
          loanId,
          kind: "reminder",
          event: "loan.overdue",
          recipientId: s.bobId,
          idempotencyKey: `reminder:${loanId}:d${i}`,
          reminderDate: `d${i}`,
          status: "sent",
          attempts: 1,
          occurredAt: i,
          updatedAt: i,
        }),
      );
    }
    const items = await s.carol.query(api.admin.loanActivity, { loanId });
    expect(items).toHaveLength(10);
    expect(items[0].key).toBe("overdue:d11");
    expect(items.some((i) => i.key === "loan.approved")).toBe(false);

    const fresh = await withLog(s, { status: "pending", attempts: 0 });
    expect((await s.carol.query(api.admin.loanActivity, { loanId: fresh }))[0]).toMatchObject({
      status: "sending",
      reason: null,
      attempts: 0,
    });
  });

  it("returns the admin DTO with attempts on any loan", async () => {
    const s = await setup();
    const loanId = await withLog(s, { attempts: 3, lastError: "no_email", lastStatusCode: 500 });
    const items = await s.carol.query(api.admin.loanActivity, { loanId });
    expect(items).toEqual([
      {
        key: "loan.approved",
        kind: "notification",
        event: "loan.approved",
        audience: "borrower",
        status: "failed",
        at: 2,
        attempts: 3,
        reason: "no_email",
      },
    ]);
    expect(Object.keys(items[0]).sort()).toEqual(
      ["at", "attempts", "audience", "event", "key", "kind", "reason", "status"],
    );
  });

  it.each([
    ["no_email", "no_email"],
    ["email_failed", "email_failed"],
    ["not_configured", "not_configured"],
    ["event_budget", "skipped"],
    ["http_500", "service_error"],
    ["timeout", "service_error"],
    ["network", "service_error"],
    ["weird", "service_error"],
    ["internal", "internal"],
    ["loan_missing", "internal"],
  ])("failed %s → %s", async (lastError, expected) => {
    const s = await setup();
    const loanId = await withLog(s, { lastError });
    expect((await s.carol.query(api.admin.loanActivity, { loanId }))[0].reason).toBe(expected);
  });

  it("retrying shows the last attempt's category; sent has none", async () => {
    const s = await setup();
    const retrying = await withLog(s, { status: "pending", attempts: 1, lastError: "http_404" });
    expect((await s.carol.query(api.admin.loanActivity, { loanId: retrying }))[0]).toMatchObject({
      status: "retrying",
      reason: "service_error",
    });
    const sent = await withLog(s, { status: "sent", sentAt: 3 });
    expect((await s.carol.query(api.admin.loanActivity, { loanId: sent }))[0]).toMatchObject({
      status: "sent",
      reason: null,
      at: 3,
    });
  });

  it("NOT_FOUND for an unknown loan", async () => {
    const s = await setup();
    const loanId = await withLog(s, {});
    await s.t.run((ctx) => ctx.db.delete(loanId));
    expect(await errorCode(s.carol.query(api.admin.loanActivity, { loanId }))).toBe("NOT_FOUND");
  });
});

describe("API surface", () => {
  it("admin exposes exactly the admin functions; users stays store + current", () => {
    expect(Object.keys(adminModule).sort()).toEqual(
      ["listLoans", "listUsers", "loanActivity", "removeTool", "setTrustedLender"].sort(),
    );
    const publicUsers = Object.entries(usersModule)
      .filter(([, fn]) => (fn as { isPublic?: boolean }).isPublic)
      .map(([name]) => name)
      .sort();
    expect(publicUsers).toEqual(["current", "store"]);
  });
});
