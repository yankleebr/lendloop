"use client";

import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "@/lib/errors";

/**
 * Ensures the signed-in Clerk user has a Convex `users` row (and that its
 * name/email are in sync) once Convex auth succeeds or the Clerk user changes.
 * Renders nothing.
 */
export function UserSync() {
  const { isAuthenticated } = useConvexAuth();
  const { userId } = useAuth();
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    storeUser().catch((error: unknown) => {
      toast.error(getErrorMessage(error));
    });
  }, [isAuthenticated, userId, storeUser]);

  return null;
}
