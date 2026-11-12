import { describe, expect, it } from "vitest";
import { formatPeriod, isActiveLoan, loanRequestSchema, maxEndDate, maxStartDate } from "./loans";

const TODAY = "2026-11-12";

function fieldErrors(startDate: string, endDate: string): Record<string, string> {
  const result = loanRequestSchema(TODAY).safeParse({ startDate, endDate });
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

describe("loanRequestSchema (client mirror of the period rules)", () => {
  it("accepts today, single-day and 30-day periods", () => {
    expect(fieldErrors(TODAY, TODAY)).toEqual({});
    expect(fieldErrors("2026-11-13", "2026-12-12")).toEqual({});
    expect(fieldErrors("2027-05-11", "2027-05-11")).toEqual({}); // today + 180
  });

  it("requires both dates", () => {
    expect(fieldErrors("", "")).toEqual({
      startDate: "Start date is required.",
      endDate: "End date is required.",
    });
  });

  it("flags each rule on the right field", () => {
    expect(fieldErrors("2026-11-11", "2026-11-12")).toEqual({
      startDate: "Start date can't be in the past.",
    });
    expect(Object.keys(fieldErrors("2027-05-12", "2027-05-12"))).toEqual(["startDate"]);
    expect(fieldErrors("2026-11-14", "2026-11-13")).toEqual({
      endDate: "End date can't be before the start date.",
    });
    expect(fieldErrors("2026-11-13", "2026-12-13")).toEqual({
      endDate: "A loan can last at most 30 days.",
    });
  });
});

describe("date limits for the inputs", () => {
  it("maxStartDate is today + 180 days", () => {
    expect(maxStartDate(TODAY)).toBe("2027-05-11");
  });

  it("maxEndDate allows a 30-day loan, and nothing until a start is picked", () => {
    expect(maxEndDate("2026-11-20")).toBe("2026-12-19");
    expect(maxEndDate("")).toBeUndefined();
  });
});

describe("display helpers", () => {
  it("formats single-day and multi-day periods as local dates", () => {
    expect(formatPeriod("2026-11-14", "2026-11-14")).toBe("Nov 14, 2026");
    expect(formatPeriod("2026-12-31", "2027-01-02")).toBe("Dec 31, 2026 → Jan 2, 2027");
  });

  it("treats only pending and approved as active", () => {
    expect(isActiveLoan("pending")).toBe(true);
    expect(isActiveLoan("approved")).toBe(true);
    for (const status of ["rejected", "cancelled", "returned"] as const) {
      expect(isActiveLoan(status)).toBe(false);
    }
  });
});
