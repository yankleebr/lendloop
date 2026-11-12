import type { ReactNode } from "react";
import type {
  Availability,
  ToolCategory,
  ToolCondition,
} from "../../../convex/lib/validators";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AVAILABILITY_LABELS, CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/tools";

interface ToolCardProps {
  name: string;
  category: ToolCategory;
  condition: ToolCondition;
  description: string;
  availability: Availability;
  ownerName?: string;
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
  isMine = false,
  actions,
}: ToolCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="break-words">{name}</CardTitle>
        {ownerName !== undefined && (
          <CardDescription className="break-words">
            Lent by {isMine ? "you" : ownerName}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{CATEGORY_LABELS[category]}</Badge>
          <Badge variant="outline">{CONDITION_LABELS[condition]}</Badge>
          <Badge variant={availability === "available" ? "default" : "destructive"}>
            {AVAILABILITY_LABELS[availability]}
          </Badge>
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
