"use client";

import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ADMIN_PAGE_SIZE } from "../../../convex/lib/adminRules";
import type { AdminLoanFilter as Filter } from "../../../convex/lib/validators";
import { AdminLoanActivity } from "@/components/activity/AdminLoanActivity";
import { LoanCard } from "@/components/loans/LoanCard";
import { LoanListSkeleton } from "@/components/loans/LoanListSkeleton";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToday } from "@/hooks/useToday";
import { adminLoansEmptyMessage, formatTimestamp } from "@/lib/admin";
import { AdminLoanFilter } from "./AdminLoanFilter";
import { LoadMoreButton } from "./LoadMoreButton";

export function AdminLoansView() {
  const { user } = useCurrentUser();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("all");
  // "skip" until the caller is known to be an admin (the query uses requireAdmin).
  // Changing the filter changes the query, so pagination restarts from page one.
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.listLoans,
    user?.role === "admin" ? { filter, today } : "skip",
    { initialNumItems: ADMIN_PAGE_SIZE },
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium">All loans</h2>
        <AdminLoanFilter value={filter} onChange={setFilter} />
      </div>

      {status === "LoadingFirstPage" ? (
        <LoanListSkeleton />
      ) : results.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{adminLoansEmptyMessage(filter)}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((loan) => (
            <li key={loan._id}>
              <LoanCard
                toolName={loan.tool.name}
                toolRemoved={!loan.tool.isActive}
                counterpart={`Lent by ${loan.lender.name}`}
                counterpartTrusted={loan.lender.isTrustedLender}
                startDate={loan.startDate}
                endDate={loan.endDate}
                status={loan.status}
                isOverdue={loan.isOverdue}
                closeReason={loan.closeReason}
                meta={
                  <p className="text-xs wrap-break-word text-muted-foreground">
                    Borrowed by {loan.borrower.name} · Requested{" "}
                    {formatTimestamp(loan._creationTime)}
                  </p>
                }
                activity={<AdminLoanActivity loanId={loan._id} />}
              />
            </li>
          ))}
        </ul>
      )}

      <LoadMoreButton status={status} loadMore={loadMore} />
    </>
  );
}
