"use client";

import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";

interface ErrorPageProps {
  error: unknown;
  retry: () => void;
}

export default function AppError({ error, retry }: ErrorPageProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-muted-foreground">{getErrorMessage(error)}</p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
