import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { AppErrorData } from "./lib/errors";
import { addDays } from "./lib/dates";
import { MAX_BOOKED_PERIODS, MAX_PENDING_PER_BORROWER } from "./lib/loanRules";
import { listOverdue, MAX_AUTO_CLOSE } from "./lib/loans";
import * as loansModule from "./loans";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const TODAY = "2026-11-12";
const ALICE = { subject: "user_alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", name: "Bob", email: "bob@example.com" };
const CAROL = { subject: "user_carol", name: "Carol", email: "carol@example.com" };
const DAVE = { subject: "user_dave", name: "Dave", email: "dave@example.com" };

const DRILL = {
  name: "Drill",
  category: "power_tools",
  condition: "good",
  description: "",
} as const;

beforeEach(() => {
  // Only Date is faked, so convex-test's own timers keep working.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
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

/** Alice owns a Drill; Bob and Dave are users; Carol is an admin (not a party). */
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
  return { t, alice, bob, admin: carol, dave, aliceId, bobId, daveId, toolId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** Inserts a loan directly (bypassing request rules), e.g. an approved or past loan. */
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

function getLoan(s: Setup, loanId: Id<"loans">) {
  return s.t.run((ctx) => ctx.db.get(loanId));
}

function period(startDate: string, endDate: string) {
  return { startDate, endDate };
}

describe("loans.request", () => {
  it("creates a pending loan with borrower = caller and lender = tool owner", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-13", "2026-11-14"),
    });
    expect(await getLoan(s, loanId)).toMatchObject({
      toolId: s.toolId,
      borrowerId: s.bobId,
      lenderId: s.aliceId,
      status: "pending",
      startDate: "2026-11-13",
      endDate: "2026-11-14",
    });
  });

  it("accepts single-day and 30-day loans", async () => {
    const s = await setup();
    await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-20", "2026-12-19"),
    });
  });

  it("rejects signed-out callers", async () => {
    const s = await setup();
    expect(
      await errorCode(
        s.t.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) }),
      ),
    ).toBe("UNAUTHENTICATED");
  });

  it("rejects the owner's own tool", async () => {
    const s = await setup();
    expect(
      await errorCode(
        s.alice.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("returns NOT_FOUND for removed and unknown tools", async () => {
    const s = await setup();
    await s.alice.mutation(api.tools.remove, { toolId: s.toolId });
    expect(
      await errorCode(
        s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) }),
      ),
    ).toBe("NOT_FOUND");
    await s.t.run((ctx) => ctx.db.delete(s.toolId));
    expect(
      await errorCode(
        s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("rejects invalid periods with INVALID_ARGUMENT", async () => {
    const s = await setup();
    const bad = [
      period("2026-11-14", "2026-11-13"),
      period("2026-2-3", "2026-02-04"),
      period("2026-02-30", "2026-03-01"),
      period("2026-11-10", "2026-11-10"), // before UTC yesterday
      period("2026-11-13", "2026-12-13"), // 31 days
      period("2027-05-12", "2027-05-12"), // > 180 days ahead
    ];
    for (const p of bad) {
      expect(
        await errorCode(s.bob.mutation(api.loans.request, { toolId: s.toolId, ...p })),
        JSON.stringify(p),
      ).toBe("INVALID_ARGUMENT");
    }
    expect(await s.t.run((ctx) => ctx.db.query("loans").collect())).toHaveLength(0);
  });

  it("rejects borrowerId / lenderId / status arguments", async () => {
    const s = await setup();
    type RequestArgs = { toolId: Id<"tools">; startDate: string; endDate: string };
    for (const extra of [{ borrowerId: s.daveId }, { lenderId: s.bobId }, { status: "approved" }]) {
      await expect(
        s.bob.mutation(api.loans.request, {
          toolId: s.toolId,
          ...period(TODAY, TODAY),
          ...extra,
        } as unknown as RequestArgs),
      ).rejects.toThrow();
    }
    expect(await s.t.run((ctx) => ctx.db.query("loans").collect())).toHaveLength(0);
  });
});

describe("overlap rules", () => {
  it("an approved Nov 14–16 loan blocks overlapping requests", async () => {
    const s = await setup();
    await insertLoan(s, { borrowerId: s.daveId, ...period("2026-11-14", "2026-11-16") });
    for (const p of [
      period("2026-11-16", "2026-11-18"),
      period("2026-11-11", "2026-11-14"), // 11 = UTC yesterday, still allowed
      period("2026-11-15", "2026-11-15"),
      period("2026-11-11", "2026-11-20"),
    ]) {
      expect(
        await errorCode(s.bob.mutation(api.loans.request, { toolId: s.toolId, ...p })),
        JSON.stringify(p),
      ).toBe("CONFLICT");
    }
    await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-17", "2026-11-18"),
    });
    await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-12", "2026-11-13"),
    });
  });

  it("pending loans of another borrower don't block", async () => {
    const s = await setup();
    await s.dave.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-14", "2026-11-16"),
    });
    await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-15", "2026-11-15"),
    });
  });

  it("the same borrower can't hold two overlapping open requests on a tool", async () => {
    const s = await setup();
    await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-14", "2026-11-16"),
    });
    expect(
      await errorCode(
        s.bob.mutation(api.loans.request, {
          toolId: s.toolId,
          ...period("2026-11-16", "2026-11-17"),
        }),
      ),
    ).toBe("CONFLICT");
  });

  it(`caps pending requests at ${MAX_PENDING_PER_BORROWER}`, async () => {
    const s = await setup();
    for (let i = 0; i < MAX_PENDING_PER_BORROWER; i++) {
      const day = String(1 + i * 2).padStart(2, "0");
      await s.bob.mutation(api.loans.request, {
        toolId: s.toolId,
        ...period(`2026-12-${day}`, `2026-12-${day}`),
      });
    }
    expect(
      await errorCode(
        s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period("2026-12-20", "2026-12-20") }),
      ),
    ).toBe("INVALID_ARGUMENT");
  });
});

describe("loans.approve", () => {
  it("lets the lender approve and stamps decidedAt", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-14", "2026-11-16"),
    });
    await s.alice.mutation(api.loans.approve, { loanId });
    const loan = await getLoan(s, loanId);
    expect(loan?.status).toBe("approved");
    expect(loan?.decidedAt).toBeGreaterThanOrEqual(Date.UTC(2026, 10, 12, 12));
  });

  it("rejects borrower, unrelated user and admin with FORBIDDEN", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    for (const caller of [s.bob, s.dave, s.admin]) {
      expect(await errorCode(caller.mutation(api.loans.approve, { loanId }))).toBe("FORBIDDEN");
      expect(await errorCode(caller.mutation(api.loans.reject, { loanId }))).toBe("FORBIDDEN");
    }
    expect((await getLoan(s, loanId))?.status).toBe("pending");
  });

  it("returns CONFLICT for non-pending loans", async () => {
    const s = await setup();
    for (const status of ["approved", "rejected", "cancelled", "returned"] as const) {
      const loanId = await insertLoan(s, { status, ...period("2027-01-01", "2027-01-01") });
      expect(await errorCode(s.alice.mutation(api.loans.approve, { loanId })), status).toBe(
        "CONFLICT",
      );
    }
  });

  it("re-checks overlap against approved loans", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-14", "2026-11-16"),
    });
    // Simulates another request approved meanwhile.
    await insertLoan(s, { borrowerId: s.daveId, ...period("2026-11-16", "2026-11-17") });
    expect(await errorCode(s.alice.mutation(api.loans.approve, { loanId }))).toBe("CONFLICT");
    expect((await getLoan(s, loanId))?.status).toBe("pending");
  });

  it("auto-rejects overlapping pending requests and leaves others untouched", async () => {
    const s = await setup();
    const winner = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-14", "2026-11-16"),
    });
    const overlapping = await s.dave.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-16", "2026-11-18"),
    });
    const separate = await s.dave.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-20", "2026-11-21"),
    });
    await s.alice.mutation(api.loans.approve, { loanId: winner });
    expect(await getLoan(s, overlapping)).toMatchObject({
      status: "rejected",
      closeReason: "period_taken",
    });
    expect((await getLoan(s, overlapping))?.decidedAt).toBeTypeOf("number");
    expect(await getLoan(s, separate)).toMatchObject({ status: "pending" });
    expect((await getLoan(s, winner))?.closeReason).toBeUndefined();
  });

  it("returns CONFLICT when the tool was removed meanwhile", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    await s.t.run((ctx) => ctx.db.patch(s.toolId, { isActive: false }));
    expect(await errorCode(s.alice.mutation(api.loans.approve, { loanId }))).toBe("CONFLICT");
  });
});

describe("loans.reject", () => {
  it("lets the lender reject a pending request (no closeReason)", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    await s.alice.mutation(api.loans.reject, { loanId });
    const loan = await getLoan(s, loanId);
    expect(loan).toMatchObject({ status: "rejected" });
    expect(loan?.decidedAt).toBeTypeOf("number");
    expect(loan?.closeReason).toBeUndefined();
    expect(await errorCode(s.alice.mutation(api.loans.reject, { loanId }))).toBe("CONFLICT");
  });

  it("returns CONFLICT for an approved loan", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, period(TODAY, TODAY));
    expect(await errorCode(s.alice.mutation(api.loans.reject, { loanId }))).toBe("CONFLICT");
  });
});

describe("loans.cancel", () => {
  it("lets the borrower cancel a pending request", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    await s.bob.mutation(api.loans.cancel, { loanId });
    const loan = await getLoan(s, loanId);
    expect(loan?.status).toBe("cancelled");
    expect(loan?.cancelledAt).toBeTypeOf("number");
  });

  it("rejects lender, unrelated user and admin with FORBIDDEN", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    for (const caller of [s.alice, s.dave, s.admin]) {
      expect(await errorCode(caller.mutation(api.loans.cancel, { loanId }))).toBe("FORBIDDEN");
    }
  });

  it("returns CONFLICT for an approved loan", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, period(TODAY, TODAY));
    expect(await errorCode(s.bob.mutation(api.loans.cancel, { loanId }))).toBe("CONFLICT");
  });
});

describe("loans.markReturned", () => {
  it("lets the lender mark an approved loan returned", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, period(TODAY, TODAY));
    await s.alice.mutation(api.loans.markReturned, { loanId });
    const loan = await getLoan(s, loanId);
    expect(loan?.status).toBe("returned");
    expect(loan?.returnedAt).toBeTypeOf("number");
    expect(await errorCode(s.alice.mutation(api.loans.markReturned, { loanId }))).toBe(
      "CONFLICT",
    );
  });

  it("rejects borrower, unrelated user and admin with FORBIDDEN", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, period(TODAY, TODAY));
    for (const caller of [s.bob, s.dave, s.admin]) {
      expect(await errorCode(caller.mutation(api.loans.markReturned, { loanId }))).toBe(
        "FORBIDDEN",
      );
    }
  });

  it("returns CONFLICT for a pending loan", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    expect(await errorCode(s.alice.mutation(api.loans.markReturned, { loanId }))).toBe(
      "CONFLICT",
    );
  });
});

describe("unknown loans and signed-out callers", () => {
  it("every mutation returns NOT_FOUND for an unknown loan id", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, period(TODAY, TODAY));
    await s.t.run((ctx) => ctx.db.delete(loanId));
    for (const caller of [s.alice, s.bob]) {
      for (const fn of [
        api.loans.approve,
        api.loans.reject,
        api.loans.cancel,
        api.loans.markReturned,
      ]) {
        expect(await errorCode(caller.mutation(fn, { loanId }))).toBe("NOT_FOUND");
      }
    }
  });

  it("every function rejects signed-out callers", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, period(TODAY, TODAY));
    for (const fn of [
      api.loans.approve,
      api.loans.reject,
      api.loans.cancel,
      api.loans.markReturned,
    ]) {
      expect(await errorCode(s.t.mutation(fn, { loanId }))).toBe("UNAUTHENTICATED");
    }
    expect(await errorCode(s.t.query(api.loans.listMyRequests, { today: TODAY }))).toBe(
      "UNAUTHENTICATED",
    );
    expect(await errorCode(s.t.query(api.loans.listIncoming, { today: TODAY }))).toBe(
      "UNAUTHENTICATED",
    );
    expect(
      await errorCode(s.t.query(api.loans.bookedPeriods, { toolId: s.toolId, today: TODAY })),
    ).toBe("UNAUTHENTICATED");
  });
});

describe("identities without a users row", () => {
  it("get UNAUTHENTICATED on every loan function", async () => {
    const s = await setup();
    const loanId = await insertLoan(s, period(TODAY, TODAY));
    const ghost = s.t.withIdentity({ subject: "user_ghost" });
    expect(
      await errorCode(
        ghost.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) }),
      ),
    ).toBe("UNAUTHENTICATED");
    for (const fn of [
      api.loans.approve,
      api.loans.reject,
      api.loans.cancel,
      api.loans.markReturned,
    ]) {
      expect(await errorCode(ghost.mutation(fn, { loanId }))).toBe("UNAUTHENTICATED");
    }
    expect(await errorCode(ghost.query(api.loans.listMyRequests, { today: TODAY }))).toBe(
      "UNAUTHENTICATED",
    );
    expect(await errorCode(ghost.query(api.loans.listIncoming, { today: TODAY }))).toBe(
      "UNAUTHENTICATED",
    );
    expect(
      await errorCode(ghost.query(api.loans.bookedPeriods, { toolId: s.toolId, today: TODAY })),
    ).toBe("UNAUTHENTICATED");
  });
});

describe("user-facing messages", () => {
  async function messageOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
    } catch (err) {
      return (err as ConvexError<AppErrorData>).data.message;
    }
    throw new Error("Expected promise to reject");
  }

  it("explain invalid transitions without leaking loan data", async () => {
    const s = await setup();
    const approved = await insertLoan(s, period(TODAY, TODAY));
    const pending = await s.bob.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-20", "2026-11-20"),
    });
    expect(await messageOf(s.bob.mutation(api.loans.cancel, { loanId: approved }))).toBe(
      "This request was already decided.",
    );
    expect(await messageOf(s.alice.mutation(api.loans.markReturned, { loanId: pending }))).toBe(
      "Only approved loans can be marked as returned.",
    );
    await s.bob.mutation(api.loans.cancel, { loanId: pending });
    expect(await messageOf(s.alice.mutation(api.loans.reject, { loanId: pending }))).toBe(
      "This request was cancelled.",
    );
    expect(await messageOf(s.dave.mutation(api.loans.approve, { loanId: approved }))).toBe(
      "Only the owner of this tool can do this.",
    );
  });
});

describe("listMyRequests / listIncoming", () => {
  it("return only the caller's loans with a public counterpart", async () => {
    const s = await setup();
    await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    await s.dave.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-20", "2026-11-20"),
    });

    const bobs = await s.bob.query(api.loans.listMyRequests, { today: TODAY });
    expect(bobs).toHaveLength(1);
    expect(Object.keys(bobs[0].lender).sort()).toEqual(["_id", "name"]);
    expect(bobs[0]).toMatchObject({
      lender: { _id: s.aliceId, name: "Alice" },
      tool: { _id: s.toolId, name: "Drill", isActive: true },
      status: "pending",
      isOverdue: false,
    });
    expect(bobs[0]).not.toHaveProperty("borrowerId");
    expect(bobs[0]).not.toHaveProperty("lenderId");

    const incoming = await s.alice.query(api.loans.listIncoming, { today: TODAY });
    expect(incoming.map((i) => i.borrower.name)).toEqual(["Dave", "Bob"]); // newest first
    for (const item of incoming) expect(Object.keys(item.borrower).sort()).toEqual(["_id", "name"]);

    expect(await s.alice.query(api.loans.listMyRequests, { today: TODAY })).toEqual([]);
    expect(await s.bob.query(api.loans.listIncoming, { today: TODAY })).toEqual([]);
    expect(await s.admin.query(api.loans.listMyRequests, { today: TODAY })).toEqual([]);
    expect(await s.admin.query(api.loans.listIncoming, { today: TODAY })).toEqual([]);
  });

  it("keep the tool name after the tool is removed", async () => {
    const s = await setup();
    await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    await s.alice.mutation(api.tools.remove, { toolId: s.toolId });
    const [item] = await s.bob.query(api.loans.listMyRequests, { today: TODAY });
    expect(item).toMatchObject({
      tool: { name: "Drill", isActive: false },
      status: "rejected",
      closeReason: "tool_removed",
    });
  });

  it("flag overdue approved loans", async () => {
    const s = await setup();
    await insertLoan(s, period("2026-11-01", "2026-11-11"));
    await insertLoan(s, period("2026-11-20", "2026-11-21"));
    const items = await s.bob.query(api.loans.listMyRequests, { today: TODAY });
    expect(items.map((i) => i.isOverdue)).toEqual([false, true]);
  });

  it("reject a malformed today", async () => {
    const s = await setup();
    expect(await errorCode(s.bob.query(api.loans.listMyRequests, { today: "today" }))).toBe(
      "INVALID_ARGUMENT",
    );
  });
});

describe("loans.bookedPeriods", () => {
  it("returns only approved periods ending today or later, dates only", async () => {
    const s = await setup();
    await insertLoan(s, period("2026-11-01", "2026-11-11")); // ended yesterday
    await insertLoan(s, period("2026-11-20", "2026-11-22"));
    await insertLoan(s, period("2026-11-10", "2026-11-12")); // ends today
    await insertLoan(s, { status: "returned", ...period("2026-11-25", "2026-11-26") });
    await s.dave.mutation(api.loans.request, {
      toolId: s.toolId,
      ...period("2026-11-28", "2026-11-28"),
    });

    const periods = await s.dave.query(api.loans.bookedPeriods, { toolId: s.toolId, today: TODAY });
    expect(periods).toEqual([period("2026-11-10", "2026-11-12"), period("2026-11-20", "2026-11-22")]);
    for (const p of periods) expect(Object.keys(p).sort()).toEqual(["endDate", "startDate"]);
  });

  it(`caps the list at ${MAX_BOOKED_PERIODS} periods, earliest first`, async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < MAX_BOOKED_PERIODS + 5; i++) {
        const day = addDays("2026-12-01", i);
        await ctx.db.insert("loans", {
          toolId: s.toolId,
          borrowerId: s.bobId,
          lenderId: s.aliceId,
          status: "approved",
          startDate: day,
          endDate: day,
        });
      }
    });
    const periods = await s.bob.query(api.loans.bookedPeriods, { toolId: s.toolId, today: TODAY });
    expect(periods).toHaveLength(MAX_BOOKED_PERIODS);
    expect(periods[0].startDate).toBe("2026-12-01");
  });

  it("returns [] for a removed tool", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.toolId, { isActive: false }));
    expect(await s.bob.query(api.loans.bookedPeriods, { toolId: s.toolId, today: TODAY })).toEqual(
      [],
    );
  });
});

describe("availability", () => {
  async function drillAvailability(s: Setup) {
    const [item] = await s.bob.query(api.tools.list, { today: TODAY });
    return item.availability;
  }

  it("follows approve (starting today) → on loan → return → available", async () => {
    const s = await setup();
    const loanId = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, "2026-11-13") });
    expect(await drillAvailability(s)).toBe("available");

    await s.alice.mutation(api.loans.approve, { loanId });
    expect(await drillAvailability(s)).toBe("on_loan");
    expect((await s.alice.query(api.tools.listMine, { today: TODAY }))[0].availability).toBe(
      "on_loan",
    );
    expect(await s.t.query(api.tools.listPublic, { today: TODAY })).toEqual([]);

    await s.alice.mutation(api.loans.markReturned, { loanId });
    expect(await drillAvailability(s)).toBe("available");
    expect(await s.t.query(api.tools.listPublic, { today: TODAY })).toHaveLength(1);
  });

  it("future approved loans keep the tool available; overdue ones keep it on loan", async () => {
    const s = await setup();
    const future = await insertLoan(s, period("2026-11-20", "2026-11-21"));
    expect(await drillAvailability(s)).toBe("available");
    await s.t.run((ctx) => ctx.db.delete(future));
    await insertLoan(s, period("2026-11-01", "2026-11-05"));
    expect(await drillAvailability(s)).toBe("on_loan");
  });

  it("works without today (server UTC fallback) and rejects a malformed one", async () => {
    const s = await setup();
    await insertLoan(s, period(TODAY, TODAY));
    expect((await s.bob.query(api.tools.list, {}))[0].availability).toBe("on_loan");
    expect(await s.t.query(api.tools.listPublic, {})).toEqual([]);
    expect(await errorCode(s.bob.query(api.tools.list, { today: "2026-13-01" }))).toBe(
      "INVALID_ARGUMENT",
    );
  });
});

describe("removing a tool with loans", () => {
  it("is blocked while a loan is approved", async () => {
    const s = await setup();
    await insertLoan(s, period("2026-11-20", "2026-11-21"));
    expect(await errorCode(s.alice.mutation(api.tools.remove, { toolId: s.toolId }))).toBe(
      "CONFLICT",
    );
    expect((await s.t.run((ctx) => ctx.db.get(s.toolId)))?.isActive).toBe(true);
  });

  it("auto-rejects pending requests; finished loans are untouched", async () => {
    const s = await setup();
    const pending = await s.bob.mutation(api.loans.request, { toolId: s.toolId, ...period(TODAY, TODAY) });
    const returned = await insertLoan(s, { status: "returned", ...period("2026-11-01", "2026-11-02") });
    await s.alice.mutation(api.tools.remove, { toolId: s.toolId });
    expect(await getLoan(s, pending)).toMatchObject({
      status: "rejected",
      closeReason: "tool_removed",
    });
    expect((await getLoan(s, returned))?.status).toBe("returned");
    expect((await s.t.run((ctx) => ctx.db.get(s.toolId)))?.isActive).toBe(false);
  });

  it("rejects every pending request, even beyond one batch", async () => {
    const s = await setup();
    const total = MAX_AUTO_CLOSE + 5;
    for (let i = 0; i < total; i++) {
      await insertLoan(s, { status: "pending", ...period("2026-11-20", "2026-11-20") });
    }
    await s.alice.mutation(api.tools.remove, { toolId: s.toolId });
    const loans = await s.t.run((ctx) => ctx.db.query("loans").collect());
    expect(loans).toHaveLength(total);
    expect(loans.every((l) => l.status === "rejected" && l.closeReason === "tool_removed")).toBe(
      true,
    );
  });
});

describe("listOverdue", () => {
  it("returns approved loans whose end date is before today", async () => {
    const s = await setup();
    const overdue = await insertLoan(s, period("2026-11-01", "2026-11-11"));
    await insertLoan(s, period("2026-11-10", TODAY));
    await insertLoan(s, { status: "returned", ...period("2026-11-01", "2026-11-02") });
    const loans = await s.t.run((ctx) => listOverdue(ctx, TODAY, 10));
    expect(loans.map((l) => l._id)).toEqual([overdue]);
  });
});

describe("API surface", () => {
  it("exposes exactly the eight loan functions", () => {
    expect(Object.keys(loansModule).sort()).toEqual(
      [
        "approve",
        "bookedPeriods",
        "cancel",
        "listIncoming",
        "listMyRequests",
        "markReturned",
        "reject",
        "request",
      ].sort(),
    );
  });
});
