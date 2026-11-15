// Read model for automation activity on a loan (see context/features/automation-activity.md).
// Never return raw automationLogs rows: only the DTOs below.

import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { MAX_ACTIVITY_PER_LOAN } from "./automationRules";
import { automationEventValidator, automationKindValidator } from "./validators";

export const ACTIVITY_AUDIENCES = ["lender", "borrower"] as const;
export const ACTIVITY_STATUSES = ["sending", "retrying", "sent", "failed"] as const;
/** Failure reasons a loan party may see (`no_email` only on rows addressed to them). */
export const PARTY_REASONS = ["no_email", "delivery_failed"] as const;
/** Failure categories for admins; raw `lastError` codes never leave the server. */
export const ADMIN_REASONS = [
  "no_email",
  "email_failed",
  "not_configured",
  "skipped",
  "service_error",
  "internal",
] as const;

export const activityAudienceValidator = v.union(...ACTIVITY_AUDIENCES.map((a) => v.literal(a)));
export const activityStatusValidator = v.union(...ACTIVITY_STATUSES.map((s) => v.literal(s)));
export const partyReasonValidator = v.union(...PARTY_REASONS.map((r) => v.literal(r)));
export const adminReasonValidator = v.union(...ADMIN_REASONS.map((r) => v.literal(r)));

const activityBaseFields = {
  /** Stable key, unique per loan: the event for notifications, `overdue:<day>` for reminders. */
  key: v.string(),
  kind: automationKindValidator,
  event: automationEventValidator,
  /** Who the message was for, as a role (never a user id). */
  audience: activityAudienceValidator,
  status: activityStatusValidator,
  /** Epoch ms of the moment that matches `status` (see activityAt). */
  at: v.number(),
};

export const activityItemValidator = v.object({
  ...activityBaseFields,
  /** Non-null only when status === "failed". */
  reason: v.union(partyReasonValidator, v.null()),
});

export const adminActivityItemValidator = v.object({
  ...activityBaseFields,
  attempts: v.number(),
  /** failed: always; retrying: last attempt's category; otherwise null. */
  reason: v.union(adminReasonValidator, v.null()),
});

export type ActivityAudience = Infer<typeof activityAudienceValidator>;
export type ActivityStatus = Infer<typeof activityStatusValidator>;
export type PartyReason = Infer<typeof partyReasonValidator>;
export type AdminReason = Infer<typeof adminReasonValidator>;
export type ActivityItem = Infer<typeof activityItemValidator>;
export type AdminActivityItem = Infer<typeof adminActivityItemValidator>;

type Log = Doc<"automationLogs">;

/** The loan's newest automationLogs rows (by_loan, _creationTime desc), bounded. */
export async function loadLoanActivity(ctx: QueryCtx, loanId: Id<"loans">): Promise<Log[]> {
  return await ctx.db
    .query("automationLogs")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(MAX_ACTIVITY_PER_LOAN);
}

export function audienceOf(log: Log, loan: Doc<"loans">): ActivityAudience {
  return log.recipientId === loan.lenderId ? "lender" : "borrower";
}

/** `pending` with no attempt yet is the normal first seconds of a delivery, not a retry. */
export function displayStatus(log: Log): ActivityStatus {
  if (log.status === "sent") return "sent";
  if (log.status === "failed") return "failed";
  return log.attempts === 0 ? "sending" : "retrying";
}

/** sent → when it went out; failed → when it was given up; in flight → since when. */
export function activityAt(log: Log): number {
  if (log.status === "sent") return log.sentAt ?? log.updatedAt;
  if (log.status === "failed") return log.updatedAt;
  return log.occurredAt;
}

export function activityKey(log: Log): string {
  return log.kind === "notification" ? log.event : `overdue:${log.reminderDate ?? log.occurredAt}`;
}

/** The other party's failure reason stays private: they only learn it wasn't delivered. */
export function partyReason(
  log: Log,
  audience: ActivityAudience,
  viewer: ActivityAudience,
): PartyReason | null {
  if (log.status !== "failed") return null;
  return audience === viewer && log.lastError === "no_email" ? "no_email" : "delivery_failed";
}

export function adminReason(log: Log): AdminReason | null {
  const status = displayStatus(log);
  if (status === "sent" || status === "sending") return null;
  switch (log.lastError) {
    case "no_email":
    case "email_failed":
    case "not_configured":
      return log.lastError;
    case "event_budget":
      return "skipped";
    case "internal":
    case "loan_missing":
      return "internal";
    default:
      // http_<code>, timeout, network, missing or unknown codes
      return "service_error";
  }
}

function baseItem(log: Log, loan: Doc<"loans">) {
  return {
    key: activityKey(log),
    kind: log.kind,
    event: log.event,
    audience: audienceOf(log, loan),
    status: displayStatus(log),
    at: activityAt(log),
  };
}

export function toActivityItem(log: Log, loan: Doc<"loans">, viewer: ActivityAudience): ActivityItem {
  const base = baseItem(log, loan);
  return { ...base, reason: partyReason(log, base.audience, viewer) };
}

export function toAdminActivityItem(log: Log, loan: Doc<"loans">): AdminActivityItem {
  return { ...baseItem(log, loan), attempts: log.attempts, reason: adminReason(log) };
}
