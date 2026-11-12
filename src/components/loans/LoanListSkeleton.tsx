import { Skeleton } from "@/components/ui/skeleton";

interface LoanListSkeletonProps {
  count?: number;
}

export function LoanListSkeleton({ count = 3 }: LoanListSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading loans"
      className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}
