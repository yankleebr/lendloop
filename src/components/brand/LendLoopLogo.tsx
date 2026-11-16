import { cn } from "@/lib/utils";
import { LOGO_PARTS, LOGO_STROKE, LOGO_VIEWBOX } from "./logo-paths";

interface LendLoopLogoProps {
  size?: "sm" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const SIZES = {
  sm: { root: "gap-2 text-lg", mark: "size-6" },
  lg: { root: "gap-3 text-4xl sm:text-5xl", mark: "size-10 sm:size-12" },
} as const;

/** Mark + "LendLoop" wordmark in the primary color; the wordmark is real text (accessible name). */
export function LendLoopLogo({ size = "sm", showWordmark = true, className }: LendLoopLogoProps) {
  const sizes = SIZES[size];
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center justify-center text-primary",
        sizes.root,
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox={LOGO_VIEWBOX}
        fill="none"
        className={cn("shrink-0", sizes.mark)}
      >
        {LOGO_PARTS.map(({ arc, head }, index) => (
          // Two-tone: the returning half at 60 % so the "out and back" reads at a glance.
          <g key={arc} className={index === 1 ? "opacity-60" : undefined}>
            <path d={arc} stroke="currentColor" strokeWidth={LOGO_STROKE} strokeLinecap="round" />
            <path d={head} fill="currentColor" />
          </g>
        ))}
      </svg>
      {showWordmark ? (
        <span translate="no" className="font-semibold tracking-tight">
          LendLoop
        </span>
      ) : (
        <span className="sr-only">LendLoop</span>
      )}
    </span>
  );
}
