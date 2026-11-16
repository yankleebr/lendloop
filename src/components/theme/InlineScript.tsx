"use client";

interface InlineScriptProps {
  html: string;
}

/**
 * Inline <script> that runs once from the server HTML. On the client it renders as
 * type="text/plain", so React does not warn about (or try to run) a script it rendered;
 * the attribute mismatch on hydration is expected.
 */
export function InlineScript({ html }: InlineScriptProps) {
  return (
    <script
      type={typeof window === "undefined" ? undefined : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
