"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";

function StoredUser() {
  const { isLoading, user } = useCurrentUser();

  if (isLoading || user === null) {
    return <p className="text-sm text-muted-foreground">Loading your account…</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Name</dt>
      <dd>{user.name}</dd>
      <dt className="text-muted-foreground">Email</dt>
      <dd className="break-all">{user.email ?? "—"}</dd>
      <dt className="text-muted-foreground">Role</dt>
      <dd>
        <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{user.role}</span>
      </dd>
    </dl>
  );
}

export function AuthStatus() {
  return (
    <div className="flex flex-col items-center gap-4">
      <AuthLoading>
        <p className="text-sm text-muted-foreground">Checking session…</p>
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal">
          <Button>Sign in to lend or borrow</Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <UserButton />
        <StoredUser />
      </Authenticated>
    </div>
  );
}
