"use client";

import Link from "next/link";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Button } from "@/components/ui/button";

/** Home page call to action: sign in when signed out, go to the board when signed in. */
export function AuthStatus() {
  return (
    <div className="flex min-h-9 items-center justify-center gap-3">
      <AuthLoading>
        <p className="text-sm text-muted-foreground">Checking session…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal" fallbackRedirectUrl="/tools">
          <Button size="lg">Sign in to lend or borrow</Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Button size="lg" render={<Link href="/tools" />} nativeButton={false}>
          Go to the board
        </Button>
        <UserButton />
      </Authenticated>
    </div>
  );
}
