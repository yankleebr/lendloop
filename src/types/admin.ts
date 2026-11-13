import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type AdminLoanItem = FunctionReturnType<typeof api.admin.listLoans>["page"][number];
export type AdminUserItem = FunctionReturnType<typeof api.admin.listUsers>["page"][number];
