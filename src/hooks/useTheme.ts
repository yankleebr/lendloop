"use client";

import { useSyncExternalStore } from "react";
import { readAppliedTheme, subscribe, type ResolvedTheme } from "@/lib/theme";

/** The theme actually painted on <html data-theme>. Server snapshot "light" keeps hydration consistent. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, readAppliedTheme, () => "light");
}
