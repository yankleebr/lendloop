"use client";

import { useNow } from "@/hooks/useNow";
import { formatAbsolute, formatRelative } from "@/lib/activity";

interface RelativeTimeProps {
  /** Epoch ms. */
  at: number;
}

/** "3 hours ago", refreshed by the shared clock; the absolute date is in `title`. */
export function RelativeTime({ at }: RelativeTimeProps) {
  const now = useNow();
  const absolute = formatAbsolute(at);
  return (
    <time dateTime={new Date(at).toISOString()} title={absolute}>
      {now === null ? absolute : formatRelative(at, now)}
    </time>
  );
}
