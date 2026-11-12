import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  roleValidator,
  toolCategoryValidator,
  toolConditionValidator,
} from "./lib/validators";

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

  tools: defineTable({
    ownerId: v.id("users"),
    // trimmed, TOOL_NAME_MIN–TOOL_NAME_MAX chars (checked in handlers)
    name: v.string(),
    category: toolCategoryValidator,
    condition: toolConditionValidator,
    // trimmed, 0–TOOL_DESCRIPTION_MAX chars; "" allowed
    description: v.string(),
    // false = removed (soft delete); no public path sets it back to true
    isActive: v.boolean(),
  })
    .index("by_active_category", ["isActive", "category"])
    .index("by_owner_active", ["ownerId", "isActive"]),
});
