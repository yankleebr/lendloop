import { ChevronRightIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityViewer, AnyActivityItem } from "@/types/activity";
import { ActivityEntry } from "./ActivityEntry";

interface ActivityListProps {
  /** undefined = loading; Error = the query failed (never thrown, see useLoanActivity). */
  result: readonly AnyActivityItem[] | undefined | Error;
  viewer: ActivityViewer;
}

/** Latest entry inline; every entry (with absolute dates) inside a native <details>. */
export function ActivityList({ result, viewer }: ActivityListProps) {
  return (
    <div className="group/activity flex flex-col gap-2">
      <Separator />
      <ActivityBody result={result} viewer={viewer} />
    </div>
  );
}

function ActivityBody({ result, viewer }: ActivityListProps) {
  if (result === undefined) return <Skeleton className="h-4 w-40" />;
  if (result instanceof Error) {
    return <p className="text-xs text-muted-foreground">Activity unavailable</p>;
  }
  if (result.length === 0) {
    return <p className="text-xs text-muted-foreground">No automated messages yet</p>;
  }

  const [latest] = result;
  return (
    <>
      {/* Hidden while the full list is open, so the latest entry isn't shown twice. */}
      <ul className="group-has-[details[open]]/activity:hidden">
        <ActivityEntry item={latest} viewer={viewer} />
      </ul>
      {result.length > 1 && (
        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
            <span className="group-open:hidden">Show all activity ({result.length})</span>
            <span className="hidden group-open:inline">Hide activity</span>
          </summary>
          <ul className="mt-1 flex flex-col gap-2">
            {result.map((item) => (
              <ActivityEntry key={item.key} item={item} viewer={viewer} showAbsolute />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
