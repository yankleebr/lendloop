import { format } from "date-fns";
import { ADMIN_LOAN_FILTERS, type AdminLoanFilter } from "../../convex/lib/validators";
import { LOAN_STATUS_LABELS } from "./loans";

export const ADMIN_LOAN_FILTER_LABELS: Record<AdminLoanFilter, string> = {
  all: "All loans",
  ...LOAN_STATUS_LABELS,
  overdue: "Overdue",
};

export const ADMIN_LOAN_FILTER_ITEMS = ADMIN_LOAN_FILTERS.map((value) => ({
  value,
  label: ADMIN_LOAN_FILTER_LABELS[value],
}));

export function adminLoansEmptyMessage(filter: AdminLoanFilter): string {
  if (filter === "all") return "No loans yet.";
  if (filter === "overdue") return "No overdue loans.";
  return "No loans with this status.";
}

/** Epoch ms → "Nov 12, 2026" (local time). */
export function formatTimestamp(ms: number): string {
  return format(new Date(ms), "MMM d, yyyy");
}
