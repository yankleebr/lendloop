import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  activityAt,
  activityKey,
  adminReason,
  audienceOf,
  displayStatus,
  partyReason,
  toActivityItem,
  toAdminActivityItem,
} from "./activity";

const LENDER = "lender_id" as Id<"users">;
const BORROWER = "borrower_id" as Id<"users">;
const LOAN = { lenderId: LENDER, borrowerId: BORROWER } as Doc<"loans">;

function log(overrides: Partial<Doc<"automationLogs">> = {}): Doc<"automationLogs"> {
  return {
    _id: "log_id" as Id<"automationLogs">,
    _creationTime: 1,
    loanId: "loan_id" as Id<"loans">,
    kind: "notification",
    event: "loan.requested",
    recipientId: LENDER,
    idempotencyKey: "notification:loan_id:loan.requested",
    status: "pending",
    attempts: 0,
    occurredAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

describe("audienceOf", () => {
  it("maps the recipient to a role", () => {
    expect(audienceOf(log({ recipientId: LENDER }), LOAN)).toBe("lender");
    expect(audienceOf(log({ recipientId: BORROWER }), LOAN)).toBe("borrower");
  });
});

describe("displayStatus", () => {
  it.each([
    [{ status: "sent" as const, attempts: 1 }, "sent"],
    [{ status: "failed" as const, attempts: 5 }, "failed"],
    [{ status: "pending" as const, attempts: 0 }, "sending"],
    [{ status: "pending" as const, attempts: 2 }, "retrying"],
  ])("%o → %s", (fields, expected) => {
    expect(displayStatus(log(fields))).toBe(expected);
  });
});

describe("activityAt", () => {
  it("sent → sentAt, falling back to updatedAt", () => {
    expect(activityAt(log({ status: "sent", sentAt: 300 }))).toBe(300);
    expect(activityAt(log({ status: "sent" }))).toBe(200);
  });
  it("failed → updatedAt; pending → occurredAt", () => {
    expect(activityAt(log({ status: "failed", sentAt: 300 }))).toBe(200);
    expect(activityAt(log({ status: "pending", attempts: 3 }))).toBe(100);
  });
});

describe("activityKey", () => {
  it("notification → event; reminder → overdue:<date>", () => {
    expect(activityKey(log({ event: "loan.approved" }))).toBe("loan.approved");
    expect(
      activityKey(log({ kind: "reminder", event: "loan.overdue", reminderDate: "2026-11-14" })),
    ).toBe("overdue:2026-11-14");
    expect(activityKey(log({ kind: "reminder", event: "loan.overdue" }))).toBe("overdue:100");
  });
});

describe("partyReason", () => {
  it("is null unless failed", () => {
    expect(partyReason(log({ status: "pending", lastError: "http_500" }), "lender", "lender")).toBeNull();
    expect(partyReason(log({ status: "sent" }), "lender", "lender")).toBeNull();
  });
  it("shows no_email only to the recipient", () => {
    const failed = log({ status: "failed", lastError: "no_email" });
    expect(partyReason(failed, "borrower", "borrower")).toBe("no_email");
    expect(partyReason(failed, "borrower", "lender")).toBe("delivery_failed");
  });
  it.each(["email_failed", "not_configured", "http_401", "timeout", "event_budget", undefined])(
    "%s → delivery_failed for both parties",
    (lastError) => {
      const failed = log({ status: "failed", lastError });
      expect(partyReason(failed, "lender", "lender")).toBe("delivery_failed");
      expect(partyReason(failed, "lender", "borrower")).toBe("delivery_failed");
    },
  );
});

describe("adminReason", () => {
  it.each([
    ["no_email", "no_email"],
    ["email_failed", "email_failed"],
    ["not_configured", "not_configured"],
    ["event_budget", "skipped"],
    ["internal", "internal"],
    ["loan_missing", "internal"],
    ["http_500", "service_error"],
    ["timeout", "service_error"],
    ["network", "service_error"],
    ["weird", "service_error"],
    [undefined, "service_error"],
  ])("failed %s → %s", (lastError, expected) => {
    expect(adminReason(log({ status: "failed", lastError }))).toBe(expected);
  });
  it("retrying shows the last attempt's category; sending and sent are null", () => {
    expect(adminReason(log({ status: "pending", attempts: 1, lastError: "http_404" }))).toBe(
      "service_error",
    );
    expect(adminReason(log({ status: "pending", attempts: 0 }))).toBeNull();
    expect(adminReason(log({ status: "sent", lastError: "http_404" }))).toBeNull();
  });
});

describe("DTOs", () => {
  it("party and admin items expose only the projected keys", () => {
    const row = log({ status: "failed", lastError: "no_email", lastStatusCode: 500, nextAttemptAt: 9 });
    expect(Object.keys(toActivityItem(row, LOAN, "lender")).sort()).toEqual(
      ["at", "audience", "event", "key", "kind", "reason", "status"],
    );
    expect(Object.keys(toAdminActivityItem(row, LOAN)).sort()).toEqual(
      ["at", "attempts", "audience", "event", "key", "kind", "reason", "status"],
    );
  });
});
