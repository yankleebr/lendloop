import { describe, expect, it } from "vitest";
import type { AnyActivityItem } from "@/types/activity";
import { activityDetails, activityLabel, formatRelative } from "./activity";

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

function item(overrides: Partial<AnyActivityItem> = {}): AnyActivityItem {
  return {
    key: "loan.requested",
    kind: "notification",
    event: "loan.requested",
    audience: "lender",
    status: "sent",
    at: NOW,
    reason: null,
    ...overrides,
  } as AnyActivityItem;
}

describe("activityLabel", () => {
  it("uses 'you' for the viewer's own role and the role name otherwise", () => {
    expect(activityLabel(item(), "lender")).toBe("You were notified of the request");
    expect(activityLabel(item(), "borrower")).toBe("The lender was notified of the request");
    expect(activityLabel(item(), "admin")).toBe("The lender was notified of the request");
  });

  it.each([
    ["loan.approved", "of the approval"],
    ["loan.rejected", "of the rejection"],
    ["loan.cancelled", "of the cancellation"],
    ["loan.returned", "that the tool was returned"],
  ] as const)("%s → %s, for every status", (event, subject) => {
    const base = { event, audience: "borrower" as const };
    expect(activityLabel(item({ ...base, status: "sent" }), "borrower")).toBe(`You were notified ${subject}`);
    expect(activityLabel(item({ ...base, status: "sending" }), "lender")).toBe(
      `Notifying the borrower ${subject}…`,
    );
    expect(activityLabel(item({ ...base, status: "retrying" }), "admin")).toBe(
      `Still trying to notify the borrower ${subject}`,
    );
    expect(activityLabel(item({ ...base, status: "failed" }), "borrower")).toBe(
      `Couldn't notify you ${subject}`,
    );
  });

  it("reminders", () => {
    const reminder = { kind: "reminder" as const, event: "loan.overdue" as const, audience: "borrower" as const };
    expect(activityLabel(item(reminder), "borrower")).toBe("Overdue reminder sent to you");
    expect(activityLabel(item(reminder), "lender")).toBe("Overdue reminder sent to the borrower");
    expect(activityLabel(item({ ...reminder, status: "failed" }), "admin")).toBe(
      "Overdue reminder to the borrower failed",
    );
  });
});

describe("activityDetails", () => {
  it("party reasons", () => {
    expect(activityDetails(item({ status: "failed", reason: "no_email" }), "lender")).toEqual([
      "No email address on your account",
    ]);
    expect(activityDetails(item({ status: "failed", reason: "delivery_failed" }), "borrower")).toEqual([
      "Couldn't be delivered",
    ]);
    expect(activityDetails(item(), "borrower")).toEqual([]);
  });

  it.each([
    ["no_email", "No email on account"],
    ["email_failed", "Email send failed"],
    ["not_configured", "Automation not configured"],
    ["skipped", "Skipped (too many events at once)"],
    ["service_error", "Notification service error"],
    ["internal", "Internal error"],
  ] as const)("admin %s → %s + attempts", (reason, label) => {
    expect(activityDetails(item({ status: "failed", reason, attempts: 1 }), "admin")).toEqual([
      label,
      "1 attempt",
    ]);
  });

  it("admin attempts are pluralized and omitted at zero", () => {
    expect(activityDetails(item({ attempts: 3 }), "admin")).toEqual(["3 attempts"]);
    expect(activityDetails(item({ status: "sending", attempts: 0 }), "admin")).toEqual([]);
  });
});

describe("formatRelative", () => {
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [61_000, "1 minute ago"],
    [90 * MIN, "1 hour ago"],
    [2 * 24 * 60 * MIN, "2 days ago"],
    [-5 * MIN, "just now"],
  ])("%i ms ago → %s", (ago, expected) => {
    expect(formatRelative(NOW - ago, NOW)).toBe(expected);
  });
});
