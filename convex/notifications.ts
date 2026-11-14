// Convex → n8n loan notifications (Workflow 1). Internal only: no public functions.
// Default runtime (Web Crypto + fetch); see context/features/loan-notifications.md.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { MAX_ATTEMPTS, WEBHOOK_TIMEOUT_MS } from "./lib/automationRules";
import { signWebhook } from "./lib/hmac";
import {
  buildPayload,
  classifyResponse,
  counterpartFor,
  deliveryOutcomeValidator,
  isNotificationLog,
  notificationPayloadValidator,
  readWebhookConfig,
  retryDelayMs,
  type DeliveryOutcome,
  type NotificationPayload,
  type WebhookConfig,
} from "./lib/notifications";

const USER_AGENT = "LendLoop-Webhooks/1";

/**
 * Pending delivery with its rebuilt payload; null when the row is gone, no
 * longer pending, or not a notification (reminder rows are never delivered).
 */
export const getDelivery = internalQuery({
  args: { logId: v.id("automationLogs") },
  returns: v.union(
    v.null(),
    v.object({ attempts: v.number(), payload: v.union(notificationPayloadValidator, v.null()) }),
  ),
  handler: async (ctx, { logId }) => {
    const log = await ctx.db.get(logId);
    if (log === null || log.status !== "pending" || !isNotificationLog(log)) return null;
    const loan = await ctx.db.get(log.loanId);
    const tool = loan ? await ctx.db.get(loan.toolId) : null;
    if (loan === null || tool === null) return { attempts: log.attempts, payload: null };
    const [recipient, counterpart] = await Promise.all([
      ctx.db.get(log.recipientId),
      ctx.db.get(counterpartFor(log.event, loan)),
    ]);
    return { attempts: log.attempts, payload: buildPayload(log, loan, tool, recipient, counterpart) };
  },
});

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}

/** One signed POST. The body sent is exactly the string that was signed. */
async function postWebhook(
  config: WebhookConfig,
  payload: NotificationPayload,
): Promise<DeliveryOutcome> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signWebhook(config.secret, timestamp, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-LendLoop-Event-Id": payload.eventId,
        "X-LendLoop-Timestamp": String(timestamp),
        "X-LendLoop-Signature": signature,
      },
      body,
    });
    return classifyResponse(response.status, response.headers.get("retry-after"));
  } catch (err) {
    return classifyResponse(isAbortError(err) ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
}

async function attemptDelivery(payload: NotificationPayload | null): Promise<DeliveryOutcome> {
  if (payload === null) return { kind: "final", code: "loan_missing" };
  const config = readWebhookConfig();
  if (config === null) return { kind: "final", code: "not_configured" };
  try {
    return await postWebhook(config, payload);
  } catch {
    return { kind: "retry", code: "internal" };
  }
}

/**
 * Scheduled by emitLoanEvent / recordAttempt. Never throws on delivery failures;
 * an unexpected error while loading the delivery is recorded as a retryable
 * `internal` attempt so the row never stays `pending` silently.
 */
export const deliver = internalAction({
  args: { logId: v.id("automationLogs") },
  returns: v.null(),
  handler: async (ctx, { logId }) => {
    const delivery = await ctx
      .runQuery(internal.notifications.getDelivery, { logId })
      .catch(() => "error" as const);
    if (delivery === null) return null;
    const outcome: DeliveryOutcome =
      delivery === "error"
        ? { kind: "retry", code: "internal" }
        : await attemptDelivery(delivery.payload);
    await ctx.runMutation(internal.notifications.recordAttempt, { logId, outcome });
    return null;
  },
});

function logAttempt(logId: Id<"automationLogs">, attempt: number, code: string, next: string) {
  const line = `notifications.deliver: ${logId} attempt ${attempt} -> ${code} (${next})`;
  if (next === "failed") console.warn(line);
  else console.log(line);
}

/** Records one delivery attempt; the only writer of a row's status after insert. */
export const recordAttempt = internalMutation({
  args: { logId: v.id("automationLogs"), outcome: deliveryOutcomeValidator },
  returns: v.null(),
  handler: async (ctx, { logId, outcome }) => {
    const log = await ctx.db.get(logId);
    if (log === null || log.status !== "pending" || !isNotificationLog(log)) return null;
    const now = Date.now();
    const attempts = log.attempts + 1;
    const statusCode = outcome.statusCode;

    if (outcome.kind === "sent") {
      await ctx.db.patch(logId, {
        status: "sent",
        attempts,
        sentAt: now,
        updatedAt: now,
        lastStatusCode: statusCode,
        lastError: undefined,
        nextAttemptAt: undefined,
      });
      logAttempt(logId, attempts, `http_${statusCode}`, "sent");
      return null;
    }

    if (outcome.kind === "retry" && attempts < MAX_ATTEMPTS) {
      const delay = retryDelayMs(attempts, Math.random(), outcome.retryAfterMs);
      await ctx.db.patch(logId, {
        attempts,
        updatedAt: now,
        lastError: outcome.code,
        lastStatusCode: statusCode,
        nextAttemptAt: now + delay,
      });
      await ctx.scheduler.runAfter(delay, internal.notifications.deliver, { logId });
      logAttempt(logId, attempts, outcome.code, `retry in ${Math.round(delay / 1000)}s`);
      return null;
    }

    await ctx.db.patch(logId, {
      status: "failed",
      attempts,
      updatedAt: now,
      lastError: outcome.code,
      lastStatusCode: statusCode,
      nextAttemptAt: undefined,
    });
    logAttempt(logId, attempts, outcome.code, "failed");
    return null;
  },
});
