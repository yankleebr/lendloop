import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { forbidden, unauthenticated } from "./errors";

// MutationCtx is structurally compatible with QueryCtx (same auth + db reader surface),
// so these helpers work in both queries and mutations.

export async function userByToken(
  ctx: QueryCtx,
  tokenIdentifier: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

/** The caller's stored user, or null when signed out or not yet stored. Never throws. */
export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return await userByToken(ctx, identity.tokenIdentifier);
}

/** The caller's stored user; throws UNAUTHENTICATED otherwise. */
export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) unauthenticated("Please sign in to continue.");
  const user = await userByToken(ctx, identity.tokenIdentifier);
  if (user === null) {
    unauthenticated("Your account is still being set up. Please try again.");
  }
  return user;
}

/** The caller's stored user if they are an admin; throws UNAUTHENTICATED / FORBIDDEN otherwise. */
export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") forbidden("Only admins can do this.");
  return user;
}
