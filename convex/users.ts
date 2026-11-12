import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser, userByToken } from "./lib/auth";
import { notFound, unauthenticated } from "./lib/errors";
import { roleValidator } from "./lib/validators";

const FALLBACK_NAME = "Neighbor";

/**
 * Creates the caller's user row on first call and keeps name/email in sync
 * with the session token. Never writes role or isTrustedLender after insert.
 */
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) unauthenticated("Please sign in to continue.");

    const name = identity.name?.trim() || FALLBACK_NAME;
    const email = identity.email;

    const existing = await userByToken(ctx, identity.tokenIdentifier);
    if (existing !== null) {
      if (existing.name !== name || existing.email !== email) {
        await ctx.db.patch(existing._id, { name, email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: "user",
      isTrustedLender: false,
    });
  },
});

/** The caller's own user (without tokenIdentifier), or null when signed out / not stored yet. */
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.string(),
      email: v.optional(v.string()),
      role: roleValidator,
      isTrustedLender: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isTrustedLender: user.isTrustedLender,
    };
  },
});

/** Operator-only (CLI / dashboard): promote or demote a user. Not callable from clients. */
export const setRole = internalMutation({
  args: { userId: v.id("users"), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { userId, role }) => {
    const user = await ctx.db.get(userId);
    if (user === null) notFound("User not found.");
    await ctx.db.patch(userId, { role });
    console.log(`users.setRole: ${userId} ${user.role} -> ${role}`);
    return null;
  },
});
