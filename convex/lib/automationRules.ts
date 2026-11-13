// Delivery rules for Convex → n8n webhooks (see context/features/loan-notifications.md).

/** HTTP attempts per event: 1 initial + 4 retries. */
export const MAX_ATTEMPTS = 5;
/** Delay before retry n (after failed attempt n), before jitter. ≈ 42 min in total. */
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_800_000] as const;
/** ± fraction applied to each retry delay. */
export const RETRY_JITTER = 0.2;
/** Upper bound for any retry delay, including a server's Retry-After. */
export const MAX_RETRY_AFTER_MS = 1_800_000;
/** Per-request timeout (AbortController). */
export const WEBHOOK_TIMEOUT_MS = 15_000;
/** Accepted |now − timestamp| for signed webhooks, in seconds. */
export const SIGNATURE_TOLERANCE_SEC = 300;
/**
 * Scheduled deliveries per transaction. Convex allows 1,000 scheduled functions
 * per mutation; events past this budget are recorded `failed` / `event_budget`.
 */
export const MAX_EVENTS_PER_TRANSACTION = 900;
/** Minimum N8N_WEBHOOK_SECRET length (32 random bytes as 64 hex chars recommended). */
export const MIN_SECRET_LENGTH = 32;
