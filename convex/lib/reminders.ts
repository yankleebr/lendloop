// Pure helpers for n8n Workflow 2 (overdue reminders).
// See context/features/overdue-reminders.md.

import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { addDays, daysBetweenInclusive, isIsoDate, utcToday } from "./dates";
import { REMINDER_ERROR_CODES, type ReminderError } from "./validators";

const MAX_LOAN_ID_LENGTH = 64;
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

// ── Request bodies ──────────────────────────────────────────────────────────

export interface ReminderReport {
  loanId: string;
  reminderDate: string;
  status: "sent" | "failed";
  error: ReminderError | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `obj` has exactly `keys` (no more, no fewer). */
function hasExactKeys(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(obj);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(obj, key));
}

/** Exactly `{ "version": 1, "type": "overdue.list" }`. */
export function parseOverdueListRequest(body: unknown): boolean {
  return (
    isPlainObject(body) &&
    hasExactKeys(body, ["version", "type"]) &&
    body.version === 1 &&
    body.type === "overdue.list"
  );
}

const REPORT_KEYS = ["version", "type", "loanId", "reminderDate", "status", "error"] as const;

/**
 * A `reminder.report` body with exact keys and types; null on any deviation.
 * `sent` ⇒ `error === null`; `failed` ⇒ `error` is a known code.
 */
export function parseReminderReport(body: unknown): ReminderReport | null {
  if (!isPlainObject(body) || !hasExactKeys(body, REPORT_KEYS)) return null;
  const { version, type, loanId, reminderDate, status, error } = body;
  if (version !== 1 || type !== "reminder.report") return null;
  if (
    typeof loanId !== "string" ||
    loanId.length > MAX_LOAN_ID_LENGTH ||
    !PRINTABLE_ASCII.test(loanId)
  ) {
    return null;
  }
  if (typeof reminderDate !== "string" || !isIsoDate(reminderDate)) return null;
  if (status === "sent") {
    return error === null ? { loanId, reminderDate, status, error: null } : null;
  }
  if (status === "failed" && (REMINDER_ERROR_CODES as readonly unknown[]).includes(error)) {
    return { loanId, reminderDate, status, error: error as ReminderError };
  }
  return null;
}

// ── Rules ───────────────────────────────────────────────────────────────────

export function reminderKey(loanId: string, reminderDate: string): string {
  return `reminder:${loanId}:${reminderDate}`;
}

/** Whole days past the inclusive end date (≥ 1 for an overdue loan). */
export function daysOverdue(endDate: string, today: string): number {
  return daysBetweenInclusive(endDate, today) - 1;
}

/** A report may be for server today or yesterday (UTC): absorbs a run crossing midnight. */
export function isReminderDateAccepted(reminderDate: string, today: string): boolean {
  return isIsoDate(reminderDate) && (reminderDate === today || reminderDate === addDays(today, -1));
}

/**
 * Was the loan overdue on `date`? Past its end date and either still approved,
 * or returned on/after that day (the email may have gone out before the return).
 */
export function wasOverdueOn(
  loan: Pick<Doc<"loans">, "status" | "endDate" | "returnedAt">,
  date: string,
): boolean {
  if (!(loan.endDate < date)) return false;
  if (loan.status === "approved") return true;
  return (
    loan.status === "returned" &&
    loan.returnedAt !== undefined &&
    utcToday(loan.returnedAt) >= date
  );
}

// ── Response shapes ─────────────────────────────────────────────────────────

// C0/C1 controls, line/paragraph separators, zero-width and bidi formatting chars.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]+/g;

/** Single-line text for email subjects/bodies: unsafe characters become one space. */
export function toEmailText(value: string): string {
  return value.replace(UNSAFE_TEXT, " ").replace(/ {2,}/g, " ").trim();
}

/** One overdue loan as sent to n8n: the borrower's own email only, no lender data. */
export const overdueItemValidator = v.object({
  loanId: v.id("loans"),
  toolName: v.string(),
  borrowerName: v.string(),
  borrowerEmail: v.union(v.string(), v.null()),
  endDate: v.string(),
  daysOverdue: v.number(),
});

export type OverdueItem = Infer<typeof overdueItemValidator>;
