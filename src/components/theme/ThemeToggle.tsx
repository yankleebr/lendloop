"use client";

import { useLayoutEffect } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResolvedTheme } from "@/hooks/useTheme";
import { applyTheme, readPreference, setTheme } from "@/lib/theme";

/** Toggles Light ↔ Dark; the icon shows the current theme. */
export function ThemeToggle() {
  const theme = useResolvedTheme();
  const isDark = theme === "dark";
  const description = isDark ? "Theme: Dark. Switch to Light" : "Theme: Light. Switch to Dark";
  const Icon = isDark ? MoonIcon : SunIcon;

  // Re-apply after a dev Strict Mode remount (no-op in production: the value is already set).
  // Reads storage, not `theme`: the hydration render still holds the server snapshot ("light").
  useLayoutEffect(() => {
    applyTheme(readPreference());
  }, [theme]);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={description}
      title={description}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
