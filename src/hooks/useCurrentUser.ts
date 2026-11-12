"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.current>>;

export interface CurrentUserState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: CurrentUser | null;
}

/**
 * The signed-in user's stored row. `isLoading` stays true while Convex auth
 * is resolving and while the user is authenticated but `users.store` has not
 * created the row yet.
 */
export function useCurrentUser(): CurrentUserState {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current, isAuthenticated ? {} : "skip");

  return {
    isLoading: authLoading || (isAuthenticated && (user === undefined || user === null)),
    isAuthenticated,
    user: user ?? null,
  };
}
