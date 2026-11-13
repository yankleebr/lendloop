import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * The only user fields other users may see. Never return raw `users` docs.
 * `isTrustedLender` is public by design (it is a badge).
 */
export const publicUserValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  isTrustedLender: v.boolean(),
});

export type PublicUser = Infer<typeof publicUserValidator>;

export const MISSING_USER_NAME = "Neighbor";

export function publicUser(user: Doc<"users">): PublicUser {
  return { _id: user._id, name: user.name, isTrustedLender: user.isTrustedLender };
}

/** Placeholder for a referenced user that no longer exists. */
export function missingPublicUser(id: Id<"users">): PublicUser {
  return { _id: id, name: MISSING_USER_NAME, isTrustedLender: false };
}
