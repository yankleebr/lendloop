import type { ReactNode } from "react";
import type { LoanCloseReason, LoanStatus } from "../../../convex/lib/validators";
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
  startDate: string;
  endDate: string;
  status: LoanStatus;
  isOverdue: boolean;
  closeReason?: LoanCloseReason;
  actions?: ReactNode;
}

export function LoanCard({
  toolName,
  toolRemoved,
  counterpart,
  startDate,
  endDate,
  status,
  isOverdue,
  closeReason,
  actions,
}: LoanCardProps) {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="break-words">
          {toolName}
          {toolRemoved && <span className="font-normal text-muted-foreground"> (removed)</span>}
        </CardTitle>
        <CardDescription className="break-words">{counterpart}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <p className="text-sm">{formatPeriod(startDate, endDate)}</p>
        <div className="flex flex-wrap gap-1.5">
          <LoanStatusBadge status={status} isOverdue={isOverdue} />
        </div>
        {closeReason !== undefined && (
          <p className="text-xs text-muted-foreground">{CLOSE_REASON_LABELS[closeReason]}</p>
        )}
      </CardContent>
      {actions !== undefined && <CardFooter className="flex-wrap gap-2">{actions}</CardFooter>}
    </Card>
  );
}
