"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ADMIN_PAGE_SIZE } from "../../../convex/lib/adminRules";
import { LoanActionDialog } from "@/components/loans/LoanActionDialog";
import { LoanListSkeleton } from "@/components/loans/LoanListSkeleton";
import { TrustedLenderBadge } from "@/components/users/TrustedLenderBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { formatTimestamp } from "@/lib/admin";
import { getErrorMessage } from "@/lib/errors";
import type { AdminUserItem } from "@/types/admin";
import { LoadMoreButton } from "./LoadMoreButton";

export function AdminUsersView() {
  const { user } = useCurrentUser();
  // "skip" until the caller is known to be an admin (the query uses requireAdmin).
  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.listUsers,
    user?.role === "admin" ? {} : "skip",
    { initialNumItems: ADMIN_PAGE_SIZE },
  );
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const [savingId, setSavingId] = useState<Id<"users"> | null>(null);
  const [untrusting, setUntrusting] = useState<AdminUserItem | null>(null);

  async function markTrusted(userId: Id<"users">) {
    setSavingId(userId);
    try {
      await setTrusted({ userId, isTrusted: true });
      toast.success("Marked as Trusted Lender");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <h2 className="text-lg font-medium">Users</h2>

      {status === "LoadingFirstPage" ? (
        <LoanListSkeleton />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((item) => (
            <li key={item._id}>
              <UserCard
                user={item}
                isSaving={savingId === item._id}
                onMarkTrusted={() => markTrusted(item._id)}
                onRemoveTrusted={() => setUntrusting(item)}
              />
            </li>
          ))}
        </ul>
      )}

      <LoadMoreButton status={status} loadMore={loadMore} />

      <LoanActionDialog
        action={
          untrusting && {
            title: "Remove Trusted Lender?",
            description: `${untrusting.name} will no longer show the Trusted Lender badge.`,
            confirmLabel: "Remove trusted",
            pendingLabel: "Saving…",
            successMessage: "Trusted Lender removed",
            destructive: true,
            run: () => setTrusted({ userId: untrusting._id, isTrusted: false }),
          }
        }
        onOpenChange={(open) => !open && setUntrusting(null)}
      />
    </>
  );
}

interface UserCardProps {
  user: AdminUserItem;
  isSaving: boolean;
  onMarkTrusted: () => void;
  onRemoveTrusted: () => void;
}

function UserCard({ user, isSaving, onMarkTrusted, onRemoveTrusted }: UserCardProps) {
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle className="wrap-break-word">
          {user.name}
          {user.isMe && <span className="font-normal text-muted-foreground"> (you)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {user.role === "admin" && <Badge>Admin</Badge>}
          {user.isTrustedLender && <TrustedLenderBadge />}
        </div>
        <p className="text-xs text-muted-foreground">
          Joined {formatTimestamp(user._creationTime)}
        </p>
      </CardContent>
      <CardFooter>
        {user.isTrustedLender ? (
          <Button variant="outline" size="sm" onClick={onRemoveTrusted}>
            <ShieldOffIcon data-icon="inline-start" />
            Remove trusted
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onMarkTrusted} disabled={isSaving}>
            <ShieldCheckIcon data-icon="inline-start" />
            {isSaving ? "Saving…" : "Mark trusted"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
