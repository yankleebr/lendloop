import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { parseIsoDate, periodsOverlap } from "./lib/dates";
import { conflict, forbidden, invalidArgument, notFound } from "./lib/errors";
import {
  MAX_BOOKED_PERIODS,
  MAX_LOAN_LIST,
  MAX_PENDING_PER_BORROWER,
} from "./lib/loanRules";
import {
  findApprovedOverlap,
  loadLoanRefs,
  loanItemFields,
  rejectOverlappingPending,
  requireLoanParty,
  toLoanItem,
  transitionLoan,
  validatePeriod,
} from "./lib/loans";
import { publicUserValidator } from "./lib/users";

const BOOKED_MESSAGE = "Those dates are already booked.";

// ── Mutations ───────────────────────────────────────────────────────────────

/** Requests a loan of someone else's active tool. Borrower and lender are never arguments. */
export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  returns: v.id("loans"),
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const me = await requireUser(ctx);
    const period = validatePeriod(startDate, endDate, Date.now());

    const tool = await ctx.db.get(toolId);
    if (tool === null || !tool.isActive) notFound("Tool not found.");
    if (tool.ownerId === me._id) forbidden("You can't borrow your own tool.");

    const myPending = await ctx.db
      .query("loans")
      .withIndex("by_borrower_status", (q) => q.eq("borrowerId", me._id).eq("status", "pending"))
      .take(MAX_PENDING_PER_BORROWER);
    if (myPending.length >= MAX_PENDING_PER_BORROWER) {
      invalidArgument(`You can have at most ${MAX_PENDING_PER_BORROWER} pending requests.`);
    }

    // An approved overlap (anyone's, including mine) means the dates are taken.
    if (await findApprovedOverlap(ctx, toolId, period)) conflict(BOOKED_MESSAGE);
    if (myPending.some((loan) => loan.toolId === toolId && periodsOverlap(loan, period))) {
      conflict("You already have a request for these dates.");
    }

    return await ctx.db.insert("loans", {
      toolId,
      borrowerId: me._id,
      lenderId: tool.ownerId,
      startDate: period.startDate,
      endDate: period.endDate,
      status: "pending",
    });
  },
});

/** Lender approves a pending request; overlapping pending requests are auto-rejected. */
export const approve = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await requireLoanParty(ctx, me, loanId, "lender");
    if (loan.status !== "pending") conflict("This request was already decided.");
    const tool = await ctx.db.get(loan.toolId);
    if (tool === null || !tool.isActive) conflict("This tool was removed.");
    if (await findApprovedOverlap(ctx, loan.toolId, loan, loan._id)) conflict(BOOKED_MESSAGE);
    await transitionLoan(ctx, loan, "approved");
    await rejectOverlappingPending(ctx, loan);
    return null;
  },
});

/** Lender rejects a pending request. */
export const reject = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await requireLoanParty(ctx, me, loanId, "lender");
    await transitionLoan(ctx, loan, "rejected");
    return null;
  },
});

/** Borrower cancels their own pending request. */
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await requireLoanParty(ctx, me, loanId, "borrower");
    await transitionLoan(ctx, loan, "cancelled");
    return null;
  },
});

/** Lender confirms the tool is back (any time while approved). */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await requireLoanParty(ctx, me, loanId, "lender");
    await transitionLoan(ctx, loan, "returned");
    return null;
  },
});

// ── Queries ─────────────────────────────────────────────────────────────────

/** Newest loans where the caller has the given role, with tool + user refs loaded. */
async function myLoans(
  ctx: QueryCtx,
  meId: Id<"users">,
  role: "borrower" | "lender",
) {
  const loans =
    role === "borrower"
      ? await ctx.db
          .query("loans")
          .withIndex("by_borrower", (q) => q.eq("borrowerId", meId))
          .order("desc")
          .take(MAX_LOAN_LIST)
      : await ctx.db
          .query("loans")
          .withIndex("by_lender", (q) => q.eq("lenderId", meId))
          .order("desc")
          .take(MAX_LOAN_LIST);
  const refs = await loadLoanRefs(ctx, loans);
  return { loans, ...refs };
}

/** Loans the caller requested (as borrower), newest first. */
export const listMyRequests = query({
  args: { today: v.string() },
  returns: v.array(v.object({ ...loanItemFields, lender: publicUserValidator })),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const today = parseIsoDate(args.today, "Today");
    const { loans, tools, users } = await myLoans(ctx, me._id, "borrower");
    return loans.map((loan) => ({
      ...toLoanItem(loan, tools.get(loan.toolId)!, today),
      lender: users.get(loan.lenderId)!,
    }));
  },
});

/** Requests and loans on the caller's tools (as lender), newest first. */
export const listIncoming = query({
  args: { today: v.string() },
  returns: v.array(v.object({ ...loanItemFields, borrower: publicUserValidator })),
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const today = parseIsoDate(args.today, "Today");
    const { loans, tools, users } = await myLoans(ctx, me._id, "lender");
    return loans.map((loan) => ({
      ...toLoanItem(loan, tools.get(loan.toolId)!, today),
      borrower: users.get(loan.borrowerId)!,
    }));
  },
});

/** Approved periods of an active tool still ending today or later. Dates only — no user data. */
export const bookedPeriods = query({
  args: { toolId: v.id("tools"), today: v.string() },
  returns: v.array(v.object({ startDate: v.string(), endDate: v.string() })),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const today = parseIsoDate(args.today, "Today");
    const tool = await ctx.db.get(args.toolId);
    if (tool === null || !tool.isActive) return [];

    const periods: { startDate: string; endDate: string }[] = [];
    const approved = ctx.db
      .query("loans")
      .withIndex("by_tool_status_start", (q) =>
        q.eq("toolId", args.toolId).eq("status", "approved"),
      );
    for await (const loan of approved) {
      if (loan.endDate < today) continue;
      periods.push({ startDate: loan.startDate, endDate: loan.endDate });
      if (periods.length >= MAX_BOOKED_PERIODS) break;
    }
    return periods;
  },
});
