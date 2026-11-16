import { Suspense } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { LendLoopLogo } from "@/components/brand/LendLoopLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PublicToolListLoader } from "@/components/tools/PublicToolListLoader";
import { ToolGridSkeleton } from "@/components/tools/ToolGridSkeleton";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-12 px-4 pt-4 pb-16">
      <div className="flex w-full justify-end">
        <ThemeToggle />
      </div>
      <section className="flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col gap-3">
          <h1>
            <LendLoopLogo size="lg" />
          </h1>
          <p className="text-lg font-medium text-primary">
            Borrow what you need. Lend what you don&apos;t.
          </p>
        </div>
        <AuthStatus />
      </section>

      <section className="flex w-full flex-col gap-4" aria-labelledby="board-heading">
        <h2 id="board-heading" className="text-xl font-medium">
          Available tools
        </h2>
        <Suspense fallback={<ToolGridSkeleton />}>
          <PublicToolListLoader />
        </Suspense>
      </section>
    </main>
  );
}
