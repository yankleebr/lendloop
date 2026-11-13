import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  MAX_RETRY_AFTER_MS,
  MIN_SECRET_LENGTH,
  RETRY_DELAYS_MS,
  RETRY_JITTER,
} from "./automationRules";
import { missingPublicUser, publicUser, publicUserValidator } from "./users";
import {
  loanCloseReasonValidator,
  loanEventTypeValidator,
  type LoanEventType,
} from "./validators";

type LoanParties = Pick<Doc<"loans">, "_id" | "borrowerId" | "lenderId">;

// ── Event catalog ───────────────────────────────────────────────────────────

/** Notify whoever did not act: the lender on requested/cancelled, the borrower otherwise. */
export function recipientFor(event: LoanEventType, loan: LoanParties): Id<"users"> {
  return event === "loan.requested" || event === "loan.cancelled" ? loan.lenderId : loan.borrowerId;
}

export function counterpartFor(event: LoanEventType, loan: LoanParties): Id<"users"> {
  return recipientFor(event, loan) === loan.lenderId ? loan.borrowerId : loan.lenderId;
}

export function notificationKey(loanId: Id<"loans">, event: LoanEventType): string {
  return `notification:${loanId}:${event}`;
}

/**
 * Transactional outbox: records the event in the caller's mutation and schedules
 * its delivery, so an event exists only if the loan change commits. Idempotent
 * per (loan, event). With `schedule: false` the row is stored `failed` /
 * `event_budget` instead (scheduler budget exceeded; never delivered).
 * `occurredAt` defaults to now; transitions pass their own event timestamp.
 */
export async function emitLoanEvent(
  ctx: MutationCtx,
  loan: LoanParties,
  event: LoanEventType,
  opts: { schedule?: boolean; occurredAt?: number } = {},
): Promise<void> {
  const idempotencyKey = notificationKey(loan._id, event);
  const existing = await ctx.db
    .query("automationLogs")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing !== null) return;

  const now = Date.now();
  const schedule = opts.schedule !== false;
  const logId = await ctx.db.insert("automationLogs", {
    loanId: loan._id,
    kind: "notification",
    event,
    recipientId: recipientFor(event, loan),
    idempotencyKey,
    status: schedule ? "pending" : "failed",
    attempts: 0,
    ...(schedule ? {} : { lastError: "event_budget" }),
    occurredAt: opts.occurredAt ?? now,
    updatedAt: now,
  });
  if (schedule) {
    await ctx.scheduler.runAfter(0, internal.notifications.deliver, { logId });
  }
}

// ── Payload ─────────────────────────────────────────────────────────────────

export const notificationPayloadValidator = v.object({
  version: v.literal(1),
  eventId: v.id("automationLogs"),
  idempotencyKey: v.string(),
  type: loanEventTypeValidator,
  occurredAt: v.string(),
  loan: v.object({
    id: v.id("loans"),
    startDate: v.string(),
    endDate: v.string(),
    closeReason: v.union(loanCloseReasonValidator, v.null()),
    removedByModerator: v.boolean(),
  }),
  tool: v.object({ name: v.string() }),
  recipient: v.object({ ...publicUserValidator.fields, email: v.union(v.string(), v.null()) }),
  counterpart: publicUserValidator,
});

export type NotificationPayload = Infer<typeof notificationPayloadValidator>;

/**
 * The ONLY fields sent to n8n, in a fixed key order. The recipient's own email
 * is included (email is the channel); the counterpart is `publicUser` only.
 */
export function buildPayload(
  log: Doc<"automationLogs">,
  loan: Doc<"loans">,
  tool: Doc<"tools">,
  recipient: Doc<"users"> | null,
  counterpart: Doc<"users"> | null,
): NotificationPayload {
  const removedByModerator =
    loan.closeReason === "tool_removed" &&
    tool.removedBy !== undefined &&
    tool.removedBy !== tool.ownerId;
  const recipientPublic = recipient ? publicUser(recipient) : missingPublicUser(log.recipientId);
  return {
    version: 1,
    eventId: log._id,
    idempotencyKey: log.idempotencyKey,
    type: log.event,
    occurredAt: new Date(log.occurredAt).toISOString(),
    loan: {
      id: loan._id,
      startDate: loan.startDate,
      endDate: loan.endDate,
      closeReason: loan.closeReason ?? null,
      removedByModerator,
    },
    tool: { name: tool.name },
    recipient: { ...recipientPublic, email: recipient?.email ?? null },
    counterpart: counterpart
      ? publicUser(counterpart)
      : missingPublicUser(counterpartFor(log.event, loan)),
  };
}

// ── Delivery outcome ────────────────────────────────────────────────────────

export const deliveryOutcomeValidator = v.union(
  v.object({ kind: v.literal("sent"), statusCode: v.number() }),
  v.object({
    kind: v.literal("retry"),
    code: v.string(),
    statusCode: v.optional(v.number()),
    retryAfterMs: v.optional(v.number()),
  }),
  v.object({ kind: v.literal("final"), code: v.string(), statusCode: v.optional(v.number()) }),
);

export type DeliveryOutcome = Infer<typeof deliveryOutcomeValidator>;

const RETRYABLE_STATUSES = new Set([404, 408, 409, 425, 429]);
const RETRY_AFTER_STATUSES = new Set([429, 503]);

/** Retry-After in its delta-seconds form only (HTTP-date is ignored). */
function parseRetryAfterMs(header: string | null | undefined): number | undefined {
  if (!header || !/^\d+$/.test(header.trim())) return undefined;
  return Number(header.trim()) * 1000;
}

/**
 * 2xx → sent. Network/timeout, 404, 408, 409, 425, 429 and 5xx → retry.
 * 3xx (redirects are never followed) and every other status → final.
 */
export function classifyResponse(
  status: number | "timeout" | "network",
  retryAfter?: string | null,
): DeliveryOutcome {
  if (status === "timeout" || status === "network") return { kind: "retry", code: status };
  const code = `http_${status}`;
  if (status >= 200 && status < 300) return { kind: "sent", statusCode: status };
  if (RETRYABLE_STATUSES.has(status) || status >= 500) {
    const retryAfterMs = RETRY_AFTER_STATUSES.has(status) ? parseRetryAfterMs(retryAfter) : undefined;
    return retryAfterMs === undefined
      ? { kind: "retry", code, statusCode: status }
      : { kind: "retry", code, statusCode: status, retryAfterMs };
  }
  return { kind: "final", code, statusCode: status };
}

/**
 * Delay before the next attempt after `attempts` failed ones (1-based), with
 * ±RETRY_JITTER jitter (`random` in [0, 1)), at least `retryAfterMs`, capped.
 */
export function retryDelayMs(attempts: number, random: number, retryAfterMs?: number): number {
  const base = RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1];
  const jittered = base * (1 + RETRY_JITTER * (2 * random - 1));
  return Math.round(Math.min(Math.max(jittered, retryAfterMs ?? 0), MAX_RETRY_AFTER_MS));
}

// ── Configuration ───────────────────────────────────────────────────────────

export interface WebhookConfig {
  url: string;
  secret: string;
}

/** Reads the n8n webhook env vars; null when missing or invalid. Never logs values. */
export function readWebhookConfig(): WebhookConfig | null {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url || !secret || secret.length < MIN_SECRET_LENGTH) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, secret };
}
