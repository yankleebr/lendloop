import { ClockIcon, MailCheckIcon, MailWarningIcon } from "lucide-react";
import { activityDetails, activityLabel, formatAbsolute } from "@/lib/activity";
import { cn } from "@/lib/utils";
import type { ActivityViewer, AnyActivityItem } from "@/types/activity";
import { RelativeTime } from "./RelativeTime";

interface ActivityEntryProps {
  item: AnyActivityItem;
  viewer: ActivityViewer;
  /** Also show the absolute date as text (touch and screen-reader users never see `title`). */
  showAbsolute?: boolean;
}

export function ActivityEntry({ item, viewer, showAbsolute = false }: ActivityEntryProps) {
  const failed = item.status === "failed";
  const Icon = failed ? MailWarningIcon : item.status === "sent" ? MailCheckIcon : ClockIcon;
  const parts = [activityLabel(item, viewer), ...activityDetails(item, viewer)];

  return (
    <li className="flex min-w-0 gap-2 text-xs">
      <Icon
        aria-hidden
        className={cn("mt-px size-3.5 shrink-0", failed ? "text-destructive" : "text-muted-foreground")}
      />
      <p className={cn("min-w-0 break-words", failed ? "text-destructive" : "text-muted-foreground")}>
        {parts.join(" · ")} · <RelativeTime at={item.at} />
        {showAbsolute && (
          <span className="block text-muted-foreground/80">{formatAbsolute(item.at)}</span>
        )}
      </p>
    </li>
  );
}
