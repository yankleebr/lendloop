import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

// @clerk/types is not installed with @clerk/nextjs 7; derive the type from the provider props.
type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/** Clerk follows our tokens, so its modal and UserButton menu switch with data-theme too. */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--primary)",
    colorPrimaryForeground: "var(--primary-foreground)",
    colorBackground: "var(--popover)",
    colorForeground: "var(--popover-foreground)",
    colorMuted: "var(--muted)",
    colorMutedForeground: "var(--muted-foreground)",
    colorInput: "var(--card)",
    colorInputForeground: "var(--foreground)",
    colorBorder: "var(--border)",
    colorRing: "var(--ring)",
    colorDanger: "var(--destructive)",
    colorSuccess: "var(--success)",
    colorWarning: "var(--warning)",
    colorNeutral: "var(--foreground)",
    colorModalBackdrop: "var(--overlay)",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-sans)",
  },
} satisfies Appearance;
