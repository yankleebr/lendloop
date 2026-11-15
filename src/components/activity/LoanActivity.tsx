"use client";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useLoanActivity } from "@/hooks/useLoanActivity";
import { ActivityList } from "./ActivityList";

interface LoanActivityProps {
  loanId: Id<"loans">;
  viewer: "borrower" | "lender";
}

/** Automation activity on a loan card, for one of the loan's parties. */
export function LoanActivity({ loanId, viewer }: LoanActivityProps) {
  const result = useLoanActivity(api.activity.forLoan, loanId);
  return <ActivityList result={result} viewer={viewer} />;
}
