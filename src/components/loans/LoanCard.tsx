import type { ReactNode } from "react";
import type { LoanCloseReason, LoanStatus } from "../../../convex/lib/validators";
import { TrustedLenderBadge } from "@/components/users/TrustedLenderBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CLOSE_REASON_LABELS, formatPeriod } from "@/lib/loans";
import { LoanStatusBadge } from "./LoanStatusBadge";

interface LoanCardProps {
  toolName: string;
  toolRemoved: boolean;
  /** e.g. "Lent by Alice" / "Requested by Bob". */
  counterpart: string;
  /** Shows the Trusted Lender badge next to the counterpart (when it is the lender). */
  counterpartTrusted?: boolean;
  startDate: string;
  endDate: string;
  status: LoanStatus;
  isOverdue: boolean;
  closeReason?: LoanCloseReason;
  /** Extra details below the status (e.g. requested date in the admin view). */
  meta?: ReactNode;
  /** Automation activity block, rendered at the end of the content. */
  activity?: ReactNode;
  actions?: ReactNode;
}

export function LoanCard({
  toolName,
  toolRemoved,
  counterpart,
  counterpartTrusted = false,
  startDate,
  endDate,
  status,
  isOverdue,
  closeReason,
  meta,
  activity,
  actions,
}: LoanCardProps) {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="wrap-break-word">
          {toolName}
          {toolRemoved && <span className="font-normal text-muted-foreground"> (removed)</span>}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 wrap-break-word">{counterpart}</span>
          {counterpartTrusted && <TrustedLenderBadge />}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <p className="text-sm">{formatPeriod(startDate, endDate)}</p>
        <div className="flex flex-wrap gap-1.5">
          <LoanStatusBadge status={status} isOverdue={isOverdue} />
        </div>
        {closeReason !== undefined && (
          <p className="text-xs text-muted-foreground">{CLOSE_REASON_LABELS[closeReason]}</p>
        )}
        {meta}
        {activity}
      </CardContent>
      {actions !== undefined && <CardFooter className="flex-wrap gap-2">{actions}</CardFooter>}
    </Card>
  );
}
