// n8n Workflow 2 (overdue reminders). Internal only: called by the httpActions
// in convex/http.ts. See context/features/overdue-reminders.md.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import {
  MAX_LOAN_LOG_SCAN,
  MAX_OVERDUE_SCAN,
  MAX_REMINDER_DAYS,
  MAX_REMINDERS_PER_RUN,
} from "./lib/automationRules";
import { listOverdue, MISSING_TOOL_NAME } from "./lib/loans";
import {
  daysOverdue,
  isReminderDateAccepted,
  overdueItemValidator,
  reminderKey,
  toEmailText,
  wasOverdueOn,
  type OverdueItem,
} from "./lib/reminders";
import { MISSING_USER_NAME } from "./lib/users";
import { automationStatusValidator, reminderErrorValidator } from "./lib/validators";

/** Should this loan get a reminder today? Skips a `sent` row today and loans at the cap. */
async function needsReminder(ctx: QueryCtx, loan: Doc<"loans">, today: string): Promise<boolean> {
  const rows = await ctx.db
    .query("automationLogs")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .take(MAX_LOAN_LOG_SCAN);
  const reminders = rows.filter((row) => row.kind === "reminder");
  const todayRow = reminders.find((row) => row.reminderDate === today);
  if (todayRow !== undefined) return todayRow.status !== "sent";
  return reminders.length < MAX_REMINDER_DAYS;
}

async function toOverdueItem(ctx: QueryCtx, loan: Doc<"loans">, today: string): Promise<OverdueItem> {
  const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
  return {
    loanId: loan._id,
    toolName: toEmailText(tool?.name ?? "") || MISSING_TOOL_NAME,
    borrowerName: toEmailText(borrower?.name ?? "") || MISSING_USER_NAME,
    borrowerEmail: borrower?.email ?? null,
    endDate: loan.endDate,
    daysOverdue: daysOverdue(loan.endDate, today),
  };
}

/**
 * Overdue loans that still need today's reminder, oldest end date first.
 * `truncated` when the scan or the per-run limit left loans for the next run.
 */
export const listOverdueForReminders = internalQuery({
  args: { today: v.string() },
  returns: v.object({ truncated: v.boolean(), loans: v.array(overdueItemValidator) }),
  handler: async (ctx, { today }) => {
    const overdue = await listOverdue(ctx, today, MAX_OVERDUE_SCAN);
    let truncated = overdue.length === MAX_OVERDUE_SCAN;
    const loans: OverdueItem[] = [];
    for (const loan of overdue) {
      if (!(await needsReminder(ctx, loan, today))) continue;
      if (loans.length === MAX_REMINDERS_PER_RUN) {
        truncated = true;
        break;
      }
      loans.push(await toOverdueItem(ctx, loan, today));
    }
    // Loans at the reminder cap stay in the oldest-first window until returned;
    // a full scan with few eligible loans means newer ones may be starved.
    if (overdue.length === MAX_OVERDUE_SCAN && loans.length < MAX_REMINDERS_PER_RUN) {
      console.warn(`reminders: overdue scan saturated (${loans.length} eligible)`);
    }
    return { truncated, loans };
  },
});

const recordResultValidator = v.union(
  v.object({
    result: v.literal("recorded"),
    status: automationStatusValidator,
    duplicate: v.boolean(),
  }),
  v.object({ result: v.literal("not_found") }),
  v.object({ result: v.literal("not_overdue") }),
  v.object({ result: v.literal("invalid_date") }),
);

/**
 * Records one reminder result reported by n8n. One row per loan per day
 * (`reminder:<loanId>:<reminderDate>`): `sent` never regresses, `failed` is
 * upgraded by a later `sent`, `failed` + `failed` counts the attempt.
 */
export const recordReminder = internalMutation({
  args: {
    loanId: v.string(),
    reminderDate: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.union(reminderErrorValidator, v.null()),
    today: v.string(),
  },
  returns: recordResultValidator,
  handler: async (ctx, args) => {
    if (!isReminderDateAccepted(args.reminderDate, args.today)) return { result: "invalid_date" as const };
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    const loan = loanId === null ? null : await ctx.db.get(loanId);
    if (loan === null) return { result: "not_found" as const };
    if (!wasOverdueOn(loan, args.reminderDate)) return { result: "not_overdue" as const };

    const idempotencyKey = reminderKey(loan._id, args.reminderDate);
    const existing = await ctx.db
      .query("automationLogs")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    const now = Date.now();
    const sent = args.status === "sent";
    const logLine = `reminders.record: ${loan._id} ${args.reminderDate} ->`;

    if (existing === null) {
      await ctx.db.insert("automationLogs", {
        loanId: loan._id,
        kind: "reminder",
        event: "loan.overdue",
        recipientId: loan.borrowerId,
        idempotencyKey,
        reminderDate: args.reminderDate,
        status: args.status,
        attempts: 1,
        ...(sent ? { sentAt: now } : { lastError: args.error ?? undefined }),
        occurredAt: now,
        updatedAt: now,
      });
      console.log(`${logLine} ${args.status}`);
      return { result: "recorded" as const, status: args.status, duplicate: false };
    }

    if (existing.status === "sent") {
      console.log(`${logLine} sent duplicate`);
      return { result: "recorded" as const, status: "sent" as const, duplicate: true };
    }

    await ctx.db.patch(
      existing._id,
      sent
        ? { status: "sent", attempts: existing.attempts + 1, sentAt: now, lastError: undefined, updatedAt: now }
        : { attempts: existing.attempts + 1, lastError: args.error ?? undefined, updatedAt: now },
    );
    console.log(`${logLine} ${args.status}`);
    return { result: "recorded" as const, status: args.status, duplicate: false };
  },
});
