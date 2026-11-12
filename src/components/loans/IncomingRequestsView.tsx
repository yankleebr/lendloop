"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckIcon, PackageCheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToday } from "@/hooks/useToday";
import { getErrorMessage } from "@/lib/errors";
import { formatPeriod } from "@/lib/loans";
import type { IncomingItem } from "@/types/loans";
import { LoanActionDialog } from "./LoanActionDialog";
import { LoanCard } from "./LoanCard";
import { LoanListSkeleton } from "./LoanListSkeleton";
import { LoanSections } from "./LoanSections";

type ConfirmKind = "reject" | "return";

export function IncomingRequestsView() {
  const { user } = useCurrentUser();
  const today = useToday();
  // "skip" until users.store has created the row (the query uses requireUser).
  const loans = useQuery(api.loans.listIncoming, user ? { today } : "skip");
  const approveLoan = useMutation(api.loans.approve);
  const rejectLoan = useMutation(api.loans.reject);
  const markReturned = useMutation(api.loans.markReturned);

  const [approvingId, setApprovingId] = useState<Id<"loans"> | null>(null);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; loan: IncomingItem } | null>(null);

  async function handleApprove(loanId: Id<"loans">) {
    setApprovingId(loanId);
    try {
      await approveLoan({ loanId });
      toast.success("Request approved");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setApprovingId(null);
    }
  }

  function renderActions(loan: IncomingItem) {
    if (loan.status === "pending") {
      const isApproving = approvingId === loan._id;
      return (
        <>
          <Button size="sm" onClick={() => handleApprove(loan._id)} disabled={isApproving}>
            <CheckIcon data-icon="inline-start" />
            {isApproving ? "Approving…" : "Approve"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirm({ kind: "reject", loan })}
            disabled={isApproving}
          >
            <XIcon data-icon="inline-start" />
            Reject
          </Button>
        </>
      );
    }
    if (loan.status === "approved") {
      return (
        <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: "return", loan })}>
          <PackageCheckIcon data-icon="inline-start" />
          Mark returned
        </Button>
      );
    }
    return undefined;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Incoming requests</h1>

      {loans === undefined ? (
        <LoanListSkeleton />
      ) : loans.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No requests for your tools yet.</p>
      ) : (
        <LoanSections
          loans={loans}
          renderLoan={(loan) => (
            <LoanCard
              toolName={loan.tool.name}
              toolRemoved={!loan.tool.isActive}
              counterpart={`Requested by ${loan.borrower.name}`}
              startDate={loan.startDate}
              endDate={loan.endDate}
              status={loan.status}
              isOverdue={loan.isOverdue}
              closeReason={loan.closeReason}
              actions={renderActions(loan)}
            />
          )}
        />
      )}

      <LoanActionDialog
        action={confirm && confirmAction(confirm.kind, confirm.loan, { rejectLoan, markReturned })}
        onOpenChange={(open) => !open && setConfirm(null)}
      />
    </>
  );
}

function confirmAction(
  kind: ConfirmKind,
  loan: IncomingItem,
  mutations: {
    rejectLoan: (args: { loanId: Id<"loans"> }) => Promise<null>;
    markReturned: (args: { loanId: Id<"loans"> }) => Promise<null>;
  },
) {
  const tool = `“${loan.tool.name}”`;
  const dates = formatPeriod(loan.startDate, loan.endDate);
  if (kind === "reject") {
    return {
      title: "Reject this request?",
      description: `${loan.borrower.name}'s request for ${tool} (${dates}) will be rejected.`,
      confirmLabel: "Reject",
      pendingLabel: "Rejecting…",
      successMessage: "Request rejected",
      destructive: true,
      run: () => mutations.rejectLoan({ loanId: loan._id }),
    };
  }
  return {
    title: "Mark as returned?",
    description: `Confirm ${tool} is back from ${loan.borrower.name}. The loan (${dates}) will be closed.`,
    confirmLabel: "Mark returned",
    pendingLabel: "Saving…",
    successMessage: "Marked as returned",
    run: () => mutations.markReturned({ loanId: loan._id }),
  };
}
