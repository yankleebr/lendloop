"use client";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useLoanActivity } from "@/hooks/useLoanActivity";
import { ActivityList } from "./ActivityList";

interface AdminLoanActivityProps {
  loanId: Id<"loans">;
}

/** Automation activity on an admin loan card, with attempts and failure categories. */
export function AdminLoanActivity({ loanId }: AdminLoanActivityProps) {
  const result = useLoanActivity(api.admin.loanActivity, loanId);
  return <ActivityList result={result} viewer="admin" />;
}
