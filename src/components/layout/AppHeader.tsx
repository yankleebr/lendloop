"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/tools", label: "All tools" },
  { href: "/tools/mine", label: "My listings" },
  { href: "/loans/requests", label: "My requests" },
  { href: "/loans/incoming", label: "Incoming" },
] as const;

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          LendLoop
        </Link>
        <nav
          aria-label="Main"
          className="order-last -mx-1 flex w-full gap-0.5 overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto sm:gap-1 [&::-webkit-scrollbar]:hidden"
        >
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-muted sm:px-2.5",
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
