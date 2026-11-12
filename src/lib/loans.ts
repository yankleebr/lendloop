import { format, parseISO } from "date-fns";
import { z } from "zod";
import { addDays, daysBetweenInclusive, isIsoDate } from "../../convex/lib/dates";
import { MAX_ADVANCE_DAYS, MAX_LOAN_DAYS } from "../../convex/lib/loanRules";
import type { LoanCloseReason, LoanStatus } from "../../convex/lib/validators";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  returned: "Returned",
};

export const LOAN_STATUS_VARIANTS: Record<LoanStatus, BadgeVariant> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
  returned: "outline",
};

export const CLOSE_REASON_LABELS: Record<LoanCloseReason, string> = {
  period_taken: "Dates taken by another request",
  tool_removed: "Tool was removed",
};

/** Open loans first in lists; the rest is history. */
export function isActiveLoan(status: LoanStatus): boolean {
  return status === "pending" || status === "approved";
}

/** "YYYY-MM-DD" → "Nov 14, 2026". parseISO reads it as a local date (never `new Date(iso)`, which is UTC). */
export function formatLoanDate(iso: string): string {
  return format(parseISO(iso), "MMM d, yyyy");
}

export function formatPeriod(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatLoanDate(startDate)
    : `${formatLoanDate(startDate)} → ${formatLoanDate(endDate)}`;
}

/** Latest start date the form offers (the server checks against its own UTC day). */
export function maxStartDate(today: string): string {
  return addDays(today, MAX_ADVANCE_DAYS);
}

/** Latest end date for a chosen start (MAX_LOAN_DAYS inclusive); undefined until a start is picked. */
export function maxEndDate(startDate: string): string | undefined {
  return isIsoDate(startDate) ? addDays(startDate, MAX_LOAN_DAYS - 1) : undefined;
}

/** Client-side mirror of the period rules (Convex stays the source of truth). */
export function loanRequestSchema(today: string) {
  const isoDate = (label: string) =>
    z.string().refine(isIsoDate, `${label} is required.`);
  return z
    .object({ startDate: isoDate("Start date"), endDate: isoDate("End date") })
    .superRefine(({ startDate, endDate }, ctx) => {
      if (!isIsoDate(startDate) || !isIsoDate(endDate)) return;
      if (startDate < today) {
        ctx.addIssue({ code: "custom", path: ["startDate"], message: "Start date can't be in the past." });
      } else if (startDate > maxStartDate(today)) {
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: `Start date must be within ${MAX_ADVANCE_DAYS} days from today.`,
        });
      }
      if (endDate < startDate) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date can't be before the start date." });
      } else if (daysBetweenInclusive(startDate, endDate) > MAX_LOAN_DAYS) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: `A loan can last at most ${MAX_LOAN_DAYS} days.`,
        });
      }
    });
}
