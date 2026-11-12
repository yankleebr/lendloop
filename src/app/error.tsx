"use client";

import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: unknown;
  retry: () => void;
}

export default function RootError({ retry }: ErrorPageProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-muted-foreground">Couldn&apos;t load the board. Try again.</p>
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  );
}
