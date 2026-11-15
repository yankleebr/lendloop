import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type ActivityItem = FunctionReturnType<typeof api.activity.forLoan>[number];
export type AdminActivityItem = FunctionReturnType<typeof api.admin.loanActivity>[number];
export type AnyActivityItem = ActivityItem | AdminActivityItem;
/** Whose page the activity is shown on: a loan party, or an admin. */
export type ActivityViewer = "borrower" | "lender" | "admin";
