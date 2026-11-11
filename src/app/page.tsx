import { AuthStatus } from "@/components/auth/AuthStatus";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">LendLoop</h1>
        <p className="text-lg text-muted-foreground">
          Borrow what you need. Lend what you don&apos;t.
        </p>
      </div>
      <AuthStatus />
    </main>
  );
}
