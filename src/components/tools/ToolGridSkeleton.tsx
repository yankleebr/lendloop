import { Skeleton } from "@/components/ui/skeleton";

interface ToolGridSkeletonProps {
  count?: number;
}

export function ToolGridSkeleton({ count = 6 }: ToolGridSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading tools"
      className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}
