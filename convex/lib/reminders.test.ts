import { describe, expect, it } from "vitest";
import {
  daysOverdue,
  isReminderDateAccepted,
  parseOverdueListRequest,
  parseReminderReport,
  reminderKey,
  toEmailText,
  wasOverdueOn,
} from "./reminders";
import { LOAN_STATUSES } from "./validators";

const REPORT = {
  version: 1,
  type: "reminder.report",
  loanId: "k57abc123",
  reminderDate: "2026-11-13",
  status: "sent",
  error: null,
};

describe("parseOverdueListRequest", () => {
  it("accepts exactly { version: 1, type: 'overdue.list' }", () => {
    expect(parseOverdueListRequest({ version: 1, type: "overdue.list" })).toBe(true);
    expect(parseOverdueListRequest({ type: "overdue.list", version: 1 })).toBe(true);
  });

  it.each([
    ["null", null],
    ["array", [1]],
    ["string", "overdue.list"],
    ["missing type", { version: 1 }],
    ["extra key", { version: 1, type: "overdue.list", today: "2026-11-13" }],
    ["version 2", { version: 2, type: "overdue.list" }],
    ["version as string", { version: "1", type: "overdue.list" }],
    ["report type", { version: 1, type: "reminder.report" }],
  ])("rejects %s", (_label, body) => {
    expect(parseOverdueListRequest(body)).toBe(false);
  });
});

describe("parseReminderReport", () => {
  it("accepts a sent report", () => {
    expect(parseReminderReport(REPORT)).toEqual({
      loanId: REPORT.loanId,
      reminderDate: REPORT.reminderDate,
      status: "sent",
      error: null,
    });
  });

  it.each(["email_failed", "no_email"])("accepts failed / %s", (error) => {
    expect(parseReminderReport({ ...REPORT, status: "failed", error })).toMatchObject({
      status: "failed",
      error,
    });
  });

  it.each([
    ["extra key", { ...REPORT, extra: true }],
    [
      "missing error",
      { version: 1, type: "reminder.report", loanId: "k57abc123", reminderDate: "2026-11-13", status: "sent" },
    ],
    ["wrong version", { ...REPORT, version: 2 }],
    ["wrong type", { ...REPORT, type: "overdue.list" }],
    ["pending status", { ...REPORT, status: "pending" }],
    ["sent with an error", { ...REPORT, error: "email_failed" }],
    ["failed without an error", { ...REPORT, status: "failed", error: null }],
    ["failed with an unknown error", { ...REPORT, status: "failed", error: "http_500" }],
    ["bad date", { ...REPORT, reminderDate: "2026-02-30" }],
    ["date with time", { ...REPORT, reminderDate: "2026-11-13T00:00:00Z" }],
    ["empty loanId", { ...REPORT, loanId: "" }],
    ["65-char loanId", { ...REPORT, loanId: "a".repeat(65) }],
    ["non-ASCII loanId", { ...REPORT, loanId: "lóan" }],
    ["loanId with a space", { ...REPORT, loanId: "a b" }],
    ["numeric loanId", { ...REPORT, loanId: 123 }],
    ["array", [REPORT]],
  ])("rejects %s", (_label, body) => {
    expect(parseReminderReport(body)).toBeNull();
  });

  it("accepts a 64-char loanId", () => {
    expect(parseReminderReport({ ...REPORT, loanId: "a".repeat(64) })).not.toBeNull();
  });
});

describe("toEmailText", () => {
  it("keeps normal text, including accents", () => {
    expect(toEmailText("Furadeira do João")).toBe("Furadeira do João");
  });

  it("turns line breaks, controls, separators and invisible chars into single spaces", () => {
    expect(toEmailText("Drill\r\nBcc: x@y.z")).toBe("Drill Bcc: x@y.z");
    expect(toEmailText("a\tb\u0000c\u007fd\u0085e")).toBe("a b c d e");
    expect(toEmailText("a b c")).toBe("a b c");
    expect(toEmailText("ad​min‮gnp.exe")).toBe("ad min gnp.exe");
    expect(toEmailText("﻿  Saw  \n")).toBe("Saw");
  });

  it("returns an empty string when nothing printable is left", () => {
    expect(toEmailText("\r\n​")).toBe("");
  });
});

describe("rules", () => {
  it("reminderKey", () => {
    expect(reminderKey("loan1", "2026-11-13")).toBe("reminder:loan1:2026-11-13");
  });

  it("daysOverdue counts whole days past the inclusive end date", () => {
    expect(daysOverdue("2026-11-12", "2026-11-13")).toBe(1);
    expect(daysOverdue("2026-11-10", "2026-11-13")).toBe(3);
    expect(daysOverdue("2026-12-31", "2027-01-02")).toBe(2);
  });

  it("isReminderDateAccepted: today or yesterday only, across boundaries", () => {
    expect(isReminderDateAccepted("2026-11-13", "2026-11-13")).toBe(true);
    expect(isReminderDateAccepted("2026-11-12", "2026-11-13")).toBe(true);
    expect(isReminderDateAccepted("2026-11-11", "2026-11-13")).toBe(false);
    expect(isReminderDateAccepted("2026-11-14", "2026-11-13")).toBe(false);
    expect(isReminderDateAccepted("2026-12-31", "2027-01-01")).toBe(true);
    expect(isReminderDateAccepted("2026-02-28", "2026-03-01")).toBe(true);
    expect(isReminderDateAccepted("2028-02-29", "2028-03-01")).toBe(true);
    expect(isReminderDateAccepted("not-a-date", "2026-11-13")).toBe(false);
  });

  it("wasOverdueOn for every status", () => {
    const date = "2026-11-13";
    const past = { endDate: "2026-11-10", returnedAt: undefined };
    const expected: Record<string, boolean> = {
      pending: false,
      approved: true,
      rejected: false,
      cancelled: false,
      returned: false,
    };
    for (const status of LOAN_STATUSES) {
      expect(wasOverdueOn({ ...past, status }, date), status).toBe(expected[status]);
    }
  });

  it("wasOverdueOn: end date must be before the day", () => {
    expect(wasOverdueOn({ status: "approved", endDate: "2026-11-13" }, "2026-11-13")).toBe(false);
    expect(wasOverdueOn({ status: "approved", endDate: "2026-11-14" }, "2026-11-13")).toBe(false);
  });

  it("wasOverdueOn: returned on/after the day counts, before does not", () => {
    const loan = { status: "returned" as const, endDate: "2026-11-10" };
    const at = (iso: string) => Date.parse(iso);
    expect(wasOverdueOn({ ...loan, returnedAt: at("2026-11-13T23:59:00Z") }, "2026-11-13")).toBe(true);
    expect(wasOverdueOn({ ...loan, returnedAt: at("2026-11-14T08:00:00Z") }, "2026-11-13")).toBe(true);
    expect(wasOverdueOn({ ...loan, returnedAt: at("2026-11-12T23:59:00Z") }, "2026-11-13")).toBe(false);
  });
});
