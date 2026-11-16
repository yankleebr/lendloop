import type { LoanStatus } from "../../../convex/lib/validators";
import { StyledBadge } from "@/components/status/StyledBadge";
import { LOAN_STATUS_LABELS } from "@/lib/loans";
import { LOAN_STATUS_STYLES, OVERDUE_STYLE } from "@/lib/status-styles";

interface LoanStatusBadgeProps {
  status: LoanStatus;
  isOverdue: boolean;
}

export function LoanStatusBadge({ status, isOverdue }: LoanStatusBadgeProps) {
  return (
    <>
      <StyledBadge style={LOAN_STATUS_STYLES[status]}>{LOAN_STATUS_LABELS[status]}</StyledBadge>
      {isOverdue && <StyledBadge style={OVERDUE_STYLE}>Overdue</StyledBadge>}
    </>
  );
}
