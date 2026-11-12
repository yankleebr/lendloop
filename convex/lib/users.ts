import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/** The only user fields other users may see. Never return raw `users` docs. */
export const publicUserValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
});

export type PublicUser = Infer<typeof publicUserValidator>;

export function publicUser(user: Doc<"users">): PublicUser {
  return { _id: user._id, name: user.name };
}
