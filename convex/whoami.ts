import { query } from "./_generated/server";

export interface WhoAmI {
  subject: string;
  name: string | null;
  email: string | null;
}

/**
 * Temporary proof that the Clerk identity reaches Convex.
 * Returns a minimal projection of the identity, or null when signed out.
 * Will be replaced by the users/RBAC helpers in a later spec.
 */
export const get = query({
  args: {},
  handler: async (ctx): Promise<WhoAmI | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }
    return {
      subject: identity.subject,
      name: identity.name ?? null,
      email: identity.email ?? null,
    };
  },
});
