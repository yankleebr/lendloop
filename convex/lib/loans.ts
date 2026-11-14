import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  addDays,
  daysBetweenInclusive,
  parseIsoDate,
  periodsOverlap,
  utcToday,
  type Period,
} from "./dates";
import { MAX_EVENTS_PER_TRANSACTION } from "./automationRules";
import { conflict, forbidden, invalidArgument, notFound } from "./errors";
import { MAX_ADVANCE_DAYS, MAX_LOAN_DAYS } from "./loanRules";
import { emitLoanEvent } from "./notifications";
import { missingPublicUser, publicUser, type PublicUser } from "./users";
import {
  loanCloseReasonValidator,
  loanStatusValidator,
  toolCategoryValidator,
  type LoanCloseReason,
  type LoanEventType,
  type LoanStatus,
} from "./validators";

/**
 * Upper bound for loans closed by the system in one transaction (auto-rejects).
 * Pending requests per tool are naturally small; this only guards the write budget.
 */
export const MAX_AUTO_CLOSE = 500;
export const MISSING_TOOL_NAME = "Removed tool";

// ── Status machine ──────────────────────────────────────────────────────────

export const LOAN_TRANSITIONS: Record<LoanStatus, readonly LoanStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["returned"],
  rejected: [],
  cancelled: [],
  returned: [],
};

export function canTransition(from: LoanStatus, to: LoanStatus): boolean {
  return LOAN_TRANSITIONS[from].includes(to);
}

function transitionError(from: LoanStatus, to: LoanStatus): string {
  if (to === "returned") return "Only approved loans can be marked as returned.";
  if (from === "cancelled") return "This request was cancelled.";
  if (from === "pending") return "This change isn't allowed.";
  return "This request was already decided.";
}

/**
 * The ONLY place that changes `loans.status`. Throws CONFLICT on an invalid
 * transition, stamps the matching event timestamp and emits the `loan.<to>`
 * notification in the same transaction (loans.request emits `loan.requested`).
 * `notify: false` records the event as `failed` / `event_budget` without
 * scheduling it (see closeLoansForRemovedTool).
 */
export async function transitionLoan(
  ctx: MutationCtx,
  loan: Doc<"loans">,
  to: LoanStatus,
  extra: { closeReason?: LoanCloseReason } = {},
  opts: { notify?: boolean } = {},
): Promise<void> {
  if (!canTransition(loan.status, to)) conflict(transitionError(loan.status, to));
  const now = Date.now();
  const stamp =
    to === "approved" || to === "rejected"
      ? { decidedAt: now }
      : to === "cancelled"
        ? { cancelledAt: now }
        : { returnedAt: now };
  await ctx.db.patch(loan._id, { status: to, ...stamp, ...extra });
  await emitLoanEvent(ctx, loan, `loan.${to}` as LoanEventType, {
    schedule: opts.notify !== false,
    occurredAt: now,
  });
}

// ── Periods and overlaps ────────────────────────────────────────────────────

/**
 * Validates a requested period against the server clock (UTC). "Not in the
 * past" allows yesterday (UTC) so users west of UTC can book their local today.
 */
export function validatePeriod(startDate: string, endDate: string, nowMs: number): Period {
  parseIsoDate(startDate, "Start date");
  parseIsoDate(endDate, "End date");
  if (endDate < startDate) invalidArgument("End date can't be before the start date.");
  if (daysBetweenInclusive(startDate, endDate) > MAX_LOAN_DAYS) {
    invalidArgument(`A loan can last at most ${MAX_LOAN_DAYS} days.`);
  }
  const today = utcToday(nowMs);
  if (startDate < addDays(today, -1)) invalidArgument("Start date can't be in the past.");
  if (startDate > addDays(today, MAX_ADVANCE_DAYS)) {
    invalidArgument(`Start date must be within ${MAX_ADVANCE_DAYS} days from today.`);
  }
  return { startDate, endDate };
}

/**
 * First approved loan of the tool sharing a day with `period` (excluding
 * `excludeLoanId`). Reads only the narrow index range
 * [toolId, "approved", ≤ endDate], so concurrent approves of overlapping
 * periods conflict under OCC and cannot both commit.
 */
export async function findApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  period: Period,
  excludeLoanId?: Id<"loans">,
): Promise<Doc<"loans"> | null> {
  const candidates = ctx.db
    .query("loans")
    .withIndex("by_tool_status_start", (q) =>
      q.eq("toolId", toolId).eq("status", "approved").lte("startDate", period.endDate),
    );
  for await (const loan of candidates) {
    if (loan._id !== excludeLoanId && loan.endDate >= period.startDate) return loan;
  }
  return null;
}

/** Pending loans of a tool, optionally only those whose period overlaps `period`. */
async function pendingLoansOfTool(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  period?: Period,
): Promise<Doc<"loans">[]> {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool_status_start", (q) => {
      const pending = q.eq("toolId", toolId).eq("status", "pending");
      return period ? pending.lte("startDate", period.endDate) : pending;
    })
    .take(MAX_AUTO_CLOSE);
  return period ? loans.filter((loan) => periodsOverlap(loan, period)) : loans;
}

/**
 * After approving `approved`, rejects every other pending request of the tool
 * that overlaps it. Emits at most 1 + MAX_AUTO_CLOSE events per approve, well
 * under the scheduler budget, so no event counter is needed here.
 */
export async function rejectOverlappingPending(
  ctx: MutationCtx,
  approved: Doc<"loans">,
): Promise<void> {
  const overlapping = await pendingLoansOfTool(ctx, approved.toolId, approved);
  for (const loan of overlapping) {
    if (loan._id === approved._id) continue;
    await transitionLoan(ctx, loan, "rejected", { closeReason: "period_taken" });
  }
}

/**
 * Loan rules for removing a tool: blocked while any loan is approved (the tool
 * is out or promised); otherwise every pending request is auto-rejected.
 */
export async function closeLoansForRemovedTool(
  ctx: MutationCtx,
  toolId: Id<"tools">,
): Promise<void> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status_start", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .first();
  if (approved !== null) {
    conflict("Mark the loan as returned (or close it) before removing this tool.");
  }
  // Batches until none is left (each batch leaves the "pending" range), so no
  // request stays pending on a removed tool. Past the scheduler budget, events
  // are still recorded but not delivered (`event_budget`).
  let events = 0;
  for (;;) {
    const batch = await pendingLoansOfTool(ctx, toolId);
    for (const loan of batch) {
      await transitionLoan(
        ctx,
        loan,
        "rejected",
        { closeReason: "tool_removed" },
        { notify: events < MAX_EVENTS_PER_TRANSACTION },
      );
      events++;
    }
    if (batch.length < MAX_AUTO_CLOSE) return;
  }
}

// ── Parties ─────────────────────────────────────────────────────────────────

/**
 * Loads a loan the caller is a party to in the given role.
 * NOT_FOUND if missing; FORBIDDEN (without loan data) for anyone else.
 */
export async function requireLoanParty(
  ctx: QueryCtx,
  me: Doc<"users">,
  loanId: Id<"loans">,
  role: "lender" | "borrower",
): Promise<Doc<"loans">> {
  const loan = await ctx.db.get(loanId);
  if (loan === null) notFound("Loan not found.");
  if (role === "lender" && loan.lenderId !== me._id) {
    forbidden("Only the owner of this tool can do this.");
  }
  if (role === "borrower" && loan.borrowerId !== me._id) {
    forbidden("Only the person who requested this loan can do this.");
  }
  return loan;
}

// ── Overdue (consumed by the reminders spec) ────────────────────────────────

/** Approved and past its (inclusive) end date. `endDate === today` is not overdue. */
export function isOverdue(loan: Pick<Doc<"loans">, "status" | "endDate">, today: string): boolean {
  return loan.status === "approved" && loan.endDate < today;
}

/** Overdue loans, oldest end date first. Internal use only (no caller check). */
export async function listOverdue(
  ctx: QueryCtx,
  today: string,
  limit: number,
): Promise<Doc<"loans">[]> {
  return await ctx.db
    .query("loans")
    .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
    .take(limit);
}

// ── Projections ─────────────────────────────────────────────────────────────

export const loanToolValidator = v.object({
  _id: v.id("tools"),
  name: v.string(),
  category: toolCategoryValidator,
  isActive: v.boolean(),
});

/** Fields shared by every loan list item (never the raw doc, never party ids). */
export const loanItemFields = {
  _id: v.id("loans"),
  _creationTime: v.number(),
  startDate: v.string(),
  endDate: v.string(),
  status: loanStatusValidator,
  decidedAt: v.optional(v.number()),
  cancelledAt: v.optional(v.number()),
  returnedAt: v.optional(v.number()),
  closeReason: v.optional(loanCloseReasonValidator),
  isOverdue: v.boolean(),
  tool: loanToolValidator,
};

type LoanTool = { _id: Id<"tools">; name: string; category: Doc<"tools">["category"]; isActive: boolean };

/** Loads each distinct tool / user once for a list of loans. */
export async function loadLoanRefs(ctx: QueryCtx, loans: Doc<"loans">[]) {
  const toolIds = [...new Set(loans.map((loan) => loan.toolId))];
  const userIds = [...new Set(loans.flatMap((loan) => [loan.borrowerId, loan.lenderId]))];
  const tools = new Map<Id<"tools">, LoanTool>();
  const users = new Map<Id<"users">, PublicUser>();
  await Promise.all([
    ...toolIds.map(async (id) => {
      const tool = await ctx.db.get(id);
      tools.set(
        id,
        tool
          ? { _id: id, name: tool.name, category: tool.category, isActive: tool.isActive }
          : { _id: id, name: MISSING_TOOL_NAME, category: "other", isActive: false },
      );
    }),
    ...userIds.map(async (id) => {
      const user = await ctx.db.get(id);
      users.set(id, user ? publicUser(user) : missingPublicUser(id));
    }),
  ]);
  return { tools, users };
}

/** Shared projection of a loan; callers add the counterpart (`lender` or `borrower`). */
export function toLoanItem(loan: Doc<"loans">, tool: LoanTool, today: string) {
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    decidedAt: loan.decidedAt,
    cancelledAt: loan.cancelledAt,
    returnedAt: loan.returnedAt,
    closeReason: loan.closeReason,
    isOverdue: isOverdue(loan, today),
    tool,
  };
}
