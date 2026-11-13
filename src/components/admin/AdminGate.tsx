"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LoanListSkeleton } from "@/components/loans/LoanListSkeleton";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AdminNav } from "./AdminNav";

/**
 * UX gate for /admin/*: non-admins get a friendly message instead of an error
 * page. Authorization itself lives in Convex (requireAdmin in every admin function).
 * Used inside each page (not in a layout), so the layout always renders its page
 * segment and Next.js can validate instant navigation.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { isLoading, user } = useCurrentUser();

  if (isLoading) return <LoanListSkeleton />;

  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Admins only</h1>
        <p className="text-muted-foreground">This area is for neighborhood moderators.</p>
        <Button render={<Link href="/tools" />} nativeButton={false}>
          Browse all tools
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminNav />
      {children}
    </div>
  );
}
