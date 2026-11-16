import type { ReactNode } from "react";
import type {
  Availability,
  ToolCategory,
  ToolCondition,
} from "../../../convex/lib/validators";
import { StyledBadge } from "@/components/status/StyledBadge";
import { TrustedLenderBadge } from "@/components/users/TrustedLenderBadge";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AVAILABILITY_STYLES } from "@/lib/status-styles";
import { AVAILABILITY_LABELS, CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/tools";

interface ToolCardProps {
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
  availability: Availability;
  ownerName?: string;
  ownerTrusted?: boolean;
  isMine?: boolean;
  actions?: ReactNode;
}

export function ToolCard({
  name,
  category,
  condition,
  description,
  availability,
  ownerName,
  ownerTrusted = false,
  isMine = false,
  actions,
}: ToolCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="break-words">{name}</CardTitle>
        {ownerName !== undefined && (
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
            <span className="min-w-0 break-words">Lent by {isMine ? "you" : ownerName}</span>
            {ownerTrusted && <TrustedLenderBadge />}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{CATEGORY_LABELS[category]}</Badge>
          <Badge variant="outline">{CONDITION_LABELS[condition]}</Badge>
          <StyledBadge style={AVAILABILITY_STYLES[availability]}>
            {AVAILABILITY_LABELS[availability]}
          </StyledBadge>
          {isMine && <Badge variant="outline">Yours</Badge>}
        </div>
        {description !== "" && (
          <p className="line-clamp-3 break-words whitespace-pre-line text-muted-foreground">
            {description}
          </p>
        )}
      </CardContent>
      {actions !== undefined && <CardFooter className="gap-2">{actions}</CardFooter>}
    </Card>
  );
}
