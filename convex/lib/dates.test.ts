import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetweenInclusive,
  isIsoDate,
  parseIsoDate,
  periodsOverlap,
  utcToday,
} from "./dates";
import type { AppErrorData } from "./errors";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ConvexError);
    return (err as ConvexError<AppErrorData>).data.code;
  }
  throw new Error("Expected function to throw");
}

describe("parseIsoDate / isIsoDate", () => {
  it("accepts real dates, including leap days", () => {
    expect(parseIsoDate("2026-11-12")).toBe("2026-11-12");
    expect(parseIsoDate("2028-02-29")).toBe("2028-02-29");
    expect(parseIsoDate("2026-12-31")).toBe("2026-12-31");
  });

  it("rejects malformed strings", () => {
    for (const bad of ["", "2026-2-3", "2026/02/03", "26-02-03", "2026-02-03T00:00", " 2026-02-03", "abcd-ef-gh"]) {
      expect(isIsoDate(bad)).toBe(false);
      expect(codeOf(() => parseIsoDate(bad))).toBe("INVALID_ARGUMENT");
    }
  });

  it("rejects impossible dates", () => {
    for (const bad of ["2026-02-30", "2026-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-01-00"]) {
      expect(codeOf(() => parseIsoDate(bad))).toBe("INVALID_ARGUMENT");
    }
  });

  it("uses the label in the message", () => {
    try {
      parseIsoDate("x", "Start date");
    } catch (err) {
      expect((err as ConvexError<AppErrorData>).data.message).toMatch(/^Start date/);
    }
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-11-12", 180)).toBe("2027-05-11");
    expect(addDays("2026-11-12", 0)).toBe("2026-11-12");
  });
});

describe("daysBetweenInclusive", () => {
  it("counts both ends", () => {
    expect(daysBetweenInclusive("2026-11-12", "2026-11-12")).toBe(1);
    expect(daysBetweenInclusive("2026-11-12", "2026-11-13")).toBe(2);
    expect(daysBetweenInclusive("2026-12-30", "2027-01-02")).toBe(4);
    expect(daysBetweenInclusive("2026-11-13", "2026-11-12")).toBe(0);
  });
});

describe("utcToday", () => {
  it("returns the UTC calendar day", () => {
    expect(utcToday(Date.UTC(2026, 10, 12, 0, 0, 0))).toBe("2026-11-12");
    expect(utcToday(Date.UTC(2026, 10, 12, 23, 59, 59))).toBe("2026-11-12");
    expect(utcToday(Date.UTC(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
  });
});

describe("periodsOverlap", () => {
  const base = { startDate: "2026-11-14", endDate: "2026-11-16" };
  const p = (startDate: string, endDate: string) => ({ startDate, endDate });

  it("treats touching days as overlapping", () => {
    expect(periodsOverlap(base, p("2026-11-16", "2026-11-18"))).toBe(true);
    expect(periodsOverlap(base, p("2026-11-10", "2026-11-14"))).toBe(true);
  });

  it("detects containment both ways", () => {
    expect(periodsOverlap(base, p("2026-11-15", "2026-11-15"))).toBe(true);
    expect(periodsOverlap(base, p("2026-11-10", "2026-11-20"))).toBe(true);
  });

  it("returns false for disjoint periods", () => {
    expect(periodsOverlap(base, p("2026-11-17", "2026-11-18"))).toBe(false);
    expect(periodsOverlap(base, p("2026-11-10", "2026-11-13"))).toBe(false);
  });
});
