"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ShieldIcon } from "lucide-react";
import { LendLoopLogo } from "@/components/brand/LendLoopLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/tools", label: "All tools" },
  { href: "/tools/mine", label: "My listings" },
  { href: "/loans/requests", label: "My requests" },
  { href: "/loans/incoming", label: "Incoming" },
] as const;

const LINK_CLASS = "rounded-md py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-muted";

function linkState(active: boolean) {
  return active ? "bg-secondary font-medium text-secondary-foreground" : "text-muted-foreground";
}

export function AppHeader() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  // UX only: admin functions are guarded by requireAdmin in Convex.
  const isAdmin = user?.role === "admin";
  const adminActive = pathname.startsWith("/admin");

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="rounded-md">
          <LendLoopLogo size="sm" />
        </Link>
        <nav
          aria-label="Main"
          className="order-last -mx-1 flex w-full gap-0.5 overflow-x-auto scrollbar-none sm:order-0 sm:w-auto sm:gap-1 [&::-webkit-scrollbar]:hidden"
        >
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(LINK_CLASS, "px-2 sm:px-2.5", linkState(active))}
              >
                {label}
              </Link>
            );
          })}
          {isAdmin && (
            // Desktop: inline with the main links.
            <Link
              href="/admin"
              aria-current={adminActive ? "page" : undefined}
              className={cn(LINK_CLASS, "hidden px-2.5 sm:inline", linkState(adminActive))}
            >
              Admin
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            // Mobile: next to the avatar, so the main links fit on one row.
            <Link
              href="/admin"
              aria-current={adminActive ? "page" : undefined}
              className={cn(
                LINK_CLASS,
                "inline-flex items-center gap-1 px-2 sm:hidden",
                linkState(adminActive),
              )}
            >
              <ShieldIcon className="size-4" aria-hidden="true" />
              Admin
            </Link>
          )}
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </header>
  );
}
