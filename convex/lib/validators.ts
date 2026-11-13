import { v, type Infer } from "convex/values";

export const roleValidator = v.union(v.literal("user"), v.literal("admin"));

export type Role = Infer<typeof roleValidator>;

// Stored as snake_case keys; human labels live in src/lib/tools.ts.
// Adding a value is non-breaking; removing/renaming one needs a data migration.
export const TOOL_CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "ladders",
  "other",
] as const;

export const TOOL_CONDITIONS = ["like_new", "good", "fair", "worn"] as const;

export const toolCategoryValidator = v.union(...TOOL_CATEGORIES.map((c) => v.literal(c)));
export const toolConditionValidator = v.union(...TOOL_CONDITIONS.map((c) => v.literal(c)));
export const availabilityValidator = v.union(v.literal("available"), v.literal("on_loan"));

export const LOAN_STATUSES = ["pending", "approved", "rejected", "cancelled", "returned"] as const;
export const loanStatusValidator = v.union(...LOAN_STATUSES.map((s) => v.literal(s)));
/** Why a pending loan was closed by the system (absent = closed by a person). */
export const loanCloseReasonValidator = v.union(
  v.literal("period_taken"),
  v.literal("tool_removed"),
);

/** Admin "all loans" filter: everything, one status, or overdue (approved + past end date). */
export const ADMIN_LOAN_FILTERS = ["all", ...LOAN_STATUSES, "overdue"] as const;
export const adminLoanFilterValidator = v.union(...ADMIN_LOAN_FILTERS.map((f) => v.literal(f)));

export type LoanStatus = Infer<typeof loanStatusValidator>;
export type AdminLoanFilter = Infer<typeof adminLoanFilterValidator>;
export type LoanCloseReason = Infer<typeof loanCloseReasonValidator>;
export type ToolCategory = Infer<typeof toolCategoryValidator>;
export type ToolCondition = Infer<typeof toolConditionValidator>;
export type Availability = Infer<typeof availabilityValidator>;
