import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationEventValidator,
  automationKindValidator,
  automationStatusValidator,
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
    // set together by deactivateTool (owner or admin removal); absent on active
    // tools and on tools removed before the admin spec
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
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
    .index("by_status_end", ["status", "endDate"])
    // admin "all loans" filtered by status, newest first (implicit _creationTime)
    .index("by_status", ["status"]),

  // Outbox + delivery log for n8n automations. Written ONLY by internal code:
  // emitLoanEvent (inside loan mutations), notifications.recordAttempt and
  // reminders.recordReminder.
  automationLogs: defineTable({
    loanId: v.id("loans"),
    // "notification" (Workflow 1) | "reminder" (Workflow 2)
    kind: automationKindValidator,
    // notification: loan.<requested|approved|rejected|cancelled|returned>; reminder: loan.overdue
    event: automationEventValidator,
    recipientId: v.id("users"),
    // unique per row, checked in the inserting mutation (Convex has no unique constraint)
    // notification: `notification:${loanId}:${event}`
    // reminder:     `reminder:${loanId}:${reminderDate}`
    idempotencyKey: v.string(),
    // reminder rows only: the UTC day ("YYYY-MM-DD") the reminder belongs to
    reminderDate: v.optional(v.string()),
    // reminder rows are never "pending" (written when n8n reports a result)
    status: automationStatusValidator,
    // notification: delivery attempts processed (0 while the first one is scheduled)
    // reminder: reports received for the key
    attempts: v.number(),
    // short code only: http_<code> | timeout | network | not_configured | event_budget | internal
    // | loan_missing | email_failed | no_email
    lastError: v.optional(v.string()),
    lastStatusCode: v.optional(v.number()),
    // epoch ms of the loan event (same transaction)
    occurredAt: v.number(),
    updatedAt: v.number(),
    // set while a retry is scheduled
    nextAttemptAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"])
    .index("by_kind_status", ["kind", "status"]),
});
