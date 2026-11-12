// Pure helpers for whole-day dates stored as "YYYY-MM-DD" strings (no timezone).
// Lexicographic order of these strings equals chronological order.

import { invalidArgument } from "./errors";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Period {
  startDate: string;
  endDate: string;
}

/** UTC midnight (epoch ms) of a valid ISO date, or null if malformed / impossible. */
function toUtcMs(iso: string): number | null {
  const match = ISO_DATE.exec(iso);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  // Round trip rejects overflowing dates such as 2026-02-30.
  return fromUtcMs(ms) === iso ? ms : null;
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar date in "YYYY-MM-DD" form. */
export function isIsoDate(value: string): boolean {
  return toUtcMs(value) !== null;
}

/** Returns `value` if it is a real "YYYY-MM-DD" date; throws INVALID_ARGUMENT otherwise. */
export function parseIsoDate(value: string, label = "Date"): string {
  if (!isIsoDate(value)) invalidArgument(`${label} must be a valid date (YYYY-MM-DD).`);
  return value;
}

/** `iso` shifted by `days` (may be negative). `iso` must be valid. */
export function addDays(iso: string, days: number): string {
  const ms = toUtcMs(iso);
  if (ms === null) throw new Error(`Invalid ISO date: ${iso}`);
  return fromUtcMs(ms + days * DAY_MS);
}

/** Number of days from `start` to `end`, both included (1 for the same day). */
export function daysBetweenInclusive(start: string, end: string): number {
  const a = toUtcMs(start);
  const b = toUtcMs(end);
  if (a === null || b === null) throw new Error(`Invalid ISO date: ${start} / ${end}`);
  return Math.round((b - a) / DAY_MS) + 1;
}

/** The UTC calendar date of an epoch-ms instant. */
export function utcToday(nowMs: number): string {
  return fromUtcMs(nowMs);
}

/** Inclusive periods overlap when they share at least one day (touching days overlap). */
export function periodsOverlap(a: Period, b: Period): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
