import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { roleValidator } from "./lib/validators";

export default defineSchema({
  users: defineTable({
    // identity.tokenIdentifier (issuer|subject) — unique per Clerk app + user
    tokenIdentifier: v.string(),
    name: v.string(),
    // the email claim can be missing (e.g. phone-only sign-up)
    email: v.optional(v.string()),
    role: roleValidator,
    isTrustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),
});
