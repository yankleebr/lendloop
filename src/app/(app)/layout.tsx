import { Suspense } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ToolGridSkeleton } from "@/components/tools/ToolGridSkeleton";

// Pages in this group call `auth.protect()` (request data), so with
// cacheComponents they must render inside <Suspense>.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
        <Suspense fallback={<ToolGridSkeleton />}>{children}</Suspense>
      </main>
    </>
  );
}
