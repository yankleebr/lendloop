import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type MyRequestItem = FunctionReturnType<typeof api.loans.listMyRequests>[number];
export type IncomingItem = FunctionReturnType<typeof api.loans.listIncoming>[number];
export type BookedPeriod = FunctionReturnType<typeof api.loans.bookedPeriods>[number];
