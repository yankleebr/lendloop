import type { LoanStatus } from "../../../convex/lib/validators";
import { Badge } from "@/components/ui/badge";
import { LOAN_STATUS_LABELS, LOAN_STATUS_VARIANTS } from "@/lib/loans";

interface LoanStatusBadgeProps {
  status: LoanStatus;
  isOverdue: boolean;
}

export function LoanStatusBadge({ status, isOverdue }: LoanStatusBadgeProps) {
  return (
    <>
      <Badge variant={LOAN_STATUS_VARIANTS[status]}>{LOAN_STATUS_LABELS[status]}</Badge>
      {isOverdue && <Badge variant="destructive">Overdue</Badge>}
    </>
  );
}
