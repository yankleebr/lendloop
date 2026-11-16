import {
  CheckIcon,
  ClockIcon,
  MailCheckIcon,
  MailWarningIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import type { ActivityStatus } from "../../convex/lib/activity";
import type { Availability, LoanStatus } from "../../convex/lib/validators";
import type { badgeVariants } from "@/components/ui/badge";

/**
 * The only place that maps a status to a look. Labels live next to their domain
 * (LOAN_STATUS_LABELS, AVAILABILITY_LABELS, src/lib/activity.ts); color is never the only signal.
 */

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export interface BadgeStyle {
  variant: BadgeVariant;
  icon?: LucideIcon;
}

export interface ActivityStyle {
  icon: LucideIcon;
  iconClass: string;
  textClass: string;
}

export const LOAN_STATUS_STYLES: Record<LoanStatus, BadgeStyle> = {
  pending: { variant: "warning", icon: ClockIcon },
  approved: { variant: "success", icon: CheckIcon },
  rejected: { variant: "destructive", icon: XIcon },
  cancelled: { variant: "outline" },
  returned: { variant: "secondary" },
};

export const OVERDUE_STYLE: BadgeStyle = { variant: "destructive", icon: TriangleAlertIcon };

export const AVAILABILITY_STYLES: Record<Availability, BadgeStyle> = {
  available: { variant: "success" },
  on_loan: { variant: "info" },
};

export const TRUSTED_LENDER_STYLE: BadgeStyle = { variant: "brand", icon: ShieldCheckIcon };

export const ACTIVITY_STATUS_STYLES: Record<ActivityStatus, ActivityStyle> = {
  sent: { icon: MailCheckIcon, iconClass: "text-success", textClass: "text-muted-foreground" },
  sending: { icon: ClockIcon, iconClass: "text-muted-foreground", textClass: "text-muted-foreground" },
  retrying: { icon: ClockIcon, iconClass: "text-warning", textClass: "text-muted-foreground" },
  failed: { icon: MailWarningIcon, iconClass: "text-destructive", textClass: "text-destructive" },
};
