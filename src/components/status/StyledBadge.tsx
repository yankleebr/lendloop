import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { BadgeStyle } from "@/lib/status-styles";

interface StyledBadgeProps {
  style: BadgeStyle;
  children: ReactNode;
}

/** Badge rendered from a BadgeStyle in src/lib/status-styles.ts (variant + optional leading icon). */
export function StyledBadge({ style: { variant, icon: Icon }, children }: StyledBadgeProps) {
  return (
    <Badge variant={variant}>
      {Icon && <Icon data-icon="inline-start" aria-hidden="true" />}
      {children}
    </Badge>
  );
}
