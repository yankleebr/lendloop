"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { XIcon } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToday } from "@/hooks/useToday";
import { formatPeriod } from "@/lib/loans";
import type { MyRequestItem } from "@/types/loans";
import { LoanActionDialog } from "./LoanActionDialog";
import { LoanCard } from "./LoanCard";
import { LoanListSkeleton } from "./LoanListSkeleton";
import { LoanSections } from "./LoanSections";

export function MyRequestsView() {
  const { user } = useCurrentUser();
  const today = useToday();
  // "skip" until users.store has created the row (the query uses requireUser).
  const loans = useQuery(api.loans.listMyRequests, user ? { today } : "skip");
  const cancelLoan = useMutation(api.loans.cancel);
  const [cancelling, setCancelling] = useState<MyRequestItem | null>(null);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>

      {loans === undefined ? (
        <LoanListSkeleton />
      ) : loans.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-muted-foreground">You haven&apos;t requested any tools yet.</p>
          <Button render={<Link href="/tools" />} nativeButton={false}>
            Browse all tools
          </Button>
        </div>
      ) : (
        <LoanSections
          loans={loans}
          renderLoan={(loan) => (
            <LoanCard
              toolName={loan.tool.name}
              toolRemoved={!loan.tool.isActive}
              counterpart={`Lent by ${loan.lender.name}`}
              startDate={loan.startDate}
              endDate={loan.endDate}
              status={loan.status}
              isOverdue={loan.isOverdue}
              closeReason={loan.closeReason}
              actions={
                loan.status === "pending" ? (
                  <Button variant="outline" size="sm" onClick={() => setCancelling(loan)}>
                    <XIcon data-icon="inline-start" />
                    Cancel request
                  </Button>
                ) : undefined
              }
            />
          )}
        />
      )}

      <LoanActionDialog
        action={
          cancelling && {
            title: "Cancel this request?",
            description: `Your request for “${cancelling.tool.name}” (${formatPeriod(cancelling.startDate, cancelling.endDate)}) will be withdrawn.`,
            confirmLabel: "Cancel request",
            pendingLabel: "Cancelling…",
            successMessage: "Request cancelled",
            destructive: true,
            run: () => cancelLoan({ loanId: cancelling._id }),
          }
        }
        onOpenChange={(open) => !open && setCancelling(null)}
      />
    </>
  );
}
