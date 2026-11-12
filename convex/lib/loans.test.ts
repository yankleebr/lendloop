import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { AppErrorData } from "./errors";
import { canTransition, isOverdue, LOAN_TRANSITIONS, validatePeriod } from "./loans";
import { LOAN_STATUSES, type LoanStatus } from "./validators";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<AppErrorData>).data.code;
  }
  throw new Error("Expected function to throw");
}

describe("LOAN_TRANSITIONS / canTransition", () => {
  const allowed = new Set([
    "pending>approved",
    "pending>rejected",
    "pending>cancelled",
    "approved>returned",
  ]);

  it("allows exactly the documented transitions (every from × to pair)", () => {
    for (const from of LOAN_STATUSES) {
      for (const to of LOAN_STATUSES) {
        expect(canTransition(from, to), `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
  });

  it("keeps final states final", () => {
    const finals: LoanStatus[] = ["rejected", "cancelled", "returned"];
    for (const status of finals) expect(LOAN_TRANSITIONS[status]).toEqual([]);
  });
});

describe("isOverdue", () => {
  const today = "2026-11-12";

  it("is true only for approved loans past their end date", () => {
    expect(isOverdue({ status: "approved", endDate: "2026-11-11" }, today)).toBe(true);
    expect(isOverdue({ status: "approved", endDate: today }, today)).toBe(false);
    expect(isOverdue({ status: "approved", endDate: "2026-11-13" }, today)).toBe(false);
  });

  it("is false for every other status", () => {
    for (const status of ["pending", "rejected", "cancelled", "returned"] as const) {
      expect(isOverdue({ status, endDate: "2026-01-01" }, today)).toBe(false);
    }
  });
});

describe("validatePeriod", () => {
  const now = Date.UTC(2026, 10, 12, 12); // 2026-11-12 12:00 UTC

  it("accepts single-day, 30-day, yesterday (UTC) and 180-days-ahead starts", () => {
    expect(validatePeriod("2026-11-12", "2026-11-12", now)).toEqual({
      startDate: "2026-11-12",
      endDate: "2026-11-12",
    });
    validatePeriod("2026-11-13", "2026-12-12", now); // 30 days
    validatePeriod("2026-11-11", "2026-11-11", now); // west of UTC: local today
    validatePeriod("2027-05-11", "2027-05-11", now); // today + 180
  });

  it("rejects bad input with INVALID_ARGUMENT", () => {
    const cases: [string, string][] = [
      ["2026-11-14", "2026-11-13"], // end before start
      ["2026-11-13", "2026-12-13"], // 31 days
      ["2026-11-10", "2026-11-12"], // before yesterday
      ["2027-05-12", "2027-05-12"], // today + 181
      ["2026-2-3", "2026-02-04"],
      ["2026-02-30", "2026-03-01"],
      ["2026-11-13", "nope"],
    ];
    for (const [start, end] of cases) {
      expect(codeOf(() => validatePeriod(start, end, now)), `${start} → ${end}`).toBe(
        "INVALID_ARGUMENT",
      );
    }
  });
});
