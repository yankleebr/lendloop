import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  loanCloseReasonValidator,
  loanStatusValidator,
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

  // Requested at = _creationTime. Status changes only through transitionLoan (convex/lib/loans.ts).
  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    // = tool.ownerId at request time; never drifts because tools.ownerId is never patched
    lenderId: v.id("users"),
    // "YYYY-MM-DD", inclusive whole days; endDate >= startDate
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
    // event timestamps, epoch ms
    decidedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    closeReason: v.optional(loanCloseReasonValidator),
  })
    .index("by_tool_status_start", ["toolId", "status", "startDate"])
    .index("by_borrower", ["borrowerId"])
    .index("by_borrower_status", ["borrowerId", "status"])
    .index("by_lender", ["lenderId"])
    .index("by_status_end", ["status", "endDate"]),
});
