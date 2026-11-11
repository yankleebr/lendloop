"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

function IdentityProof() {
  const me = useQuery(api.whoami.get);

  if (me === undefined) {
    return <p className="text-sm text-muted-foreground">Loading identity…</p>;
  }
  if (me === null) {
    return <p className="text-sm text-muted-foreground">No identity received.</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Subject</dt>
      <dd className="font-mono break-all">{me.subject}</dd>
      <dt className="text-muted-foreground">Name</dt>
      <dd>{me.name ?? "—"}</dd>
      <dt className="text-muted-foreground">Email</dt>
      <dd>{me.email ?? "—"}</dd>
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
        <IdentityProof />
      </Authenticated>
    </div>
  );
}
