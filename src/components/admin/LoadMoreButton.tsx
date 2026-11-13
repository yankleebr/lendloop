"use client";

import type { PaginationStatus } from "convex/react";
import { Button } from "@/components/ui/button";
import { ADMIN_PAGE_SIZE } from "../../../convex/lib/adminRules";

interface LoadMoreButtonProps {
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
}

/** "Load more" for usePaginatedQuery lists; hidden once everything is loaded. */
export function LoadMoreButton({ status, loadMore }: LoadMoreButtonProps) {
  if (status !== "CanLoadMore" && status !== "LoadingMore") return null;
  const isLoading = status === "LoadingMore";
  return (
    <div className="flex justify-center">
      <Button variant="outline" onClick={() => loadMore(ADMIN_PAGE_SIZE)} disabled={isLoading}>
        {isLoading ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}
