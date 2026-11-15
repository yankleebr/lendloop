import { format, formatDistanceStrict } from "date-fns";
import type { AnyActivityItem, ActivityViewer } from "@/types/activity";

type LabelFields = Pick<AnyActivityItem, "kind" | "event" | "audience" | "status">;

/** What each notification was about, as the end of "notified …". */
const NOTIFICATION_SUBJECTS: Record<string, string> = {
  "loan.requested": "of the request",
  "loan.approved": "of the approval",
  "loan.rejected": "of the rejection",
  "loan.cancelled": "of the cancellation",
  "loan.returned": "that the tool was returned",
};

const PARTY_REASON_LABELS: Record<string, string> = {
  no_email: "No email address on your account",
  delivery_failed: "Couldn't be delivered",
};

const ADMIN_REASON_LABELS: Record<string, string> = {
  no_email: "No email on account",
  email_failed: "Email send failed",
  not_configured: "Automation not configured",
  skipped: "Skipped (too many events at once)",
  service_error: "Notification service error",
  internal: "Internal error",
};

function who(item: LabelFields, viewer: ActivityViewer): string {
  if (item.audience === viewer) return "you";
  return item.audience === "lender" ? "the lender" : "the borrower";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Plain-language sentence for one entry, from the viewer's point of view. */
export function activityLabel(item: LabelFields, viewer: ActivityViewer): string {
  const person = who(item, viewer);
  if (item.kind === "reminder") {
    if (item.status === "sent") return `Overdue reminder sent to ${person}`;
    if (item.status === "failed") return `Overdue reminder to ${person} failed`;
    return `Sending overdue reminder to ${person}…`;
  }
  const subject = NOTIFICATION_SUBJECTS[item.event] ?? "of an update";
  switch (item.status) {
    case "sent":
      return capitalize(`${person} ${person === "you" ? "were" : "was"} notified ${subject}`);
    case "sending":
      return `Notifying ${person} ${subject}…`;
    case "retrying":
      return `Still trying to notify ${person} ${subject}`;
    case "failed":
      return `Couldn't notify ${person} ${subject}`;
  }
}

/** Extra parts after the label: failure reason, and attempts for admins. */
export function activityDetails(item: AnyActivityItem, viewer: ActivityViewer): string[] {
  const parts: string[] = [];
  const labels = viewer === "admin" ? ADMIN_REASON_LABELS : PARTY_REASON_LABELS;
  if (item.reason !== null) parts.push(labels[item.reason] ?? "Couldn't be delivered");
  if (viewer === "admin" && "attempts" in item && item.attempts > 0) {
    parts.push(`${item.attempts} ${item.attempts === 1 ? "attempt" : "attempts"}`);
  }
  return parts;
}

/** "just now" under a minute (and for future times from clock skew), else "3 hours ago". */
export function formatRelative(at: number, now: number): string {
  if (now - at < 60_000) return "just now";
  return formatDistanceStrict(at, now, { addSuffix: true, roundingMethod: "floor" });
}

/** "Nov 13, 2026, 2:05 PM" in the viewer's time zone. */
export function formatAbsolute(at: number): string {
  return format(at, "PPp");
}
