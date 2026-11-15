# Automation Activity — Bonus F (Recent Automation Activity on Each Loan) (DEV)

## Overview

Each loan card shows what the automations did for that loan, in plain language: notification emails (Workflow 1) and overdue reminders (Workflow 2). The data already exists in `automationLogs`. This feature adds a **read model** (two Convex queries that return a safe projection, never raw rows) and a small **activity block** on the loan cards in *My requests*, *Incoming requests* and `/admin/loans`. Visibility follows the loan: only its two parties see it, and admins see it (with more detail) in the admin view.

Example cards (plain text, 375px wide):

```
┌ Drill ───────────────────────────────┐   ┌ Ladder ──────────────────────────────┐
│ Lent by Alice  ✔ Trusted             │   │ Requested by Bob                     │
│ Nov 10, 2026 → Nov 12, 2026          │   │ Nov 20, 2026                         │
│ [Approved] [Overdue]                 │   │ [Pending]                            │
│ ─────────────────────────────────    │   │ ─────────────────────────────────    │
│ ✉ Overdue reminder sent to you       │   │ ✉ You were notified of the request   │
│   · 2 days ago                       │   │   · 3 hours ago                      │
│ ▸ Show all activity (4)              │   │                                      │
└──────────────────────────────────────┘   └──────────────────────────────────────┘

┌ Sander (admin view) ─────────────────┐
│ Lent by Carol                        │
│ Borrowed by Bob · Requested Nov 9    │
│ ─────────────────────────────────    │
│ ⚠ Overdue reminder to borrower       │
│   failed · No email on account       │
│   · 1 attempt · yesterday            │
│ ▸ Show all activity (5)              │
└──────────────────────────────────────┘
```

Targets **DEV** only. No schema change, no n8n change, no new npm package, no new shadcn component.

## Prerequisites

### Already done (see `context/current-feature.md` → *History*)

- `automationLogs` (`convex/schema.ts`): `loanId`, `kind` (`notification` | `reminder`), `event` (`loan.requested|approved|rejected|cancelled|returned` | `loan.overdue`), `recipientId`, `idempotencyKey`, `reminderDate?`, `status` (`pending` | `sent` | `failed`), `attempts`, `lastError?` (short codes), `lastStatusCode?`, `occurredAt`, `updatedAt`, `nextAttemptAt?`, `sentAt?`. Indexes `by_idempotency_key`, `by_loan` (`["loanId"]`), `by_kind_status`.
- Writers: `emitLoanEvent` (inside `loans.request` / `transitionLoan`), `notifications.recordAttempt`, `reminders.recordReminder`. This feature only **reads**.
- Notification recipient = whoever did **not** act (`recipientFor`): the lender on `requested` / `cancelled`, the borrower on `approved` / `rejected` / `returned`. Reminder recipient = borrower. Reminder rows are never `pending`.
- `lastError` codes: `http_<code>`, `timeout`, `network`, `not_configured`, `event_budget`, `internal`, `loan_missing` (WF1); `email_failed`, `no_email` (WF2). `failed` rows are never resent.
- Rows per loan are bounded by the write rules: **≤ 3 notifications** (`requested` + one of `approved` / `rejected` / `cancelled` + `returned` only after `approved`; one row per event key) and **≤ 7 reminder rows** (`MAX_REMINDER_DAYS`). So ≤ 10 rows per loan.
- Auth helpers `requireUser` / `requireAdmin` (`convex/lib/auth.ts`), errors `notFound` / `forbidden` (`convex/lib/errors.ts`). `requireLoanParty` throws FORBIDDEN for non-parties.
- Views: `MyRequestsView` (`api.loans.listMyRequests`, ≤ `MAX_LOAN_LIST` = 100), `IncomingRequestsView` (`api.loans.listIncoming`, ≤ 100), `AdminLoansView` (`api.admin.listLoans`, paginated, `ADMIN_PAGE_SIZE` 20, max 50 per page, "Load more"). All render `LoanCard` (`src/components/loans/LoanCard.tsx`, slots `meta` and `actions`; the admin view already uses `meta`).
- Every page under `src/app/(app)/` starts with `await auth.protect()`; no page or route is added here.
- Installed: `convex` 1.49.0, `date-fns` 4.x (default locale `enUS`), `@base-ui/react` 1.9, React 19.3 + React Compiler. shadcn base-nova components installed: `alert-dialog`, `badge`, `button`, `card`, `dialog`, `field`, `input`, `label`, `select`, `separator`, `skeleton`, `sonner`, `textarea`. **Not** installed: `collapsible`, `tooltip`, `popover`.

### User prerequisites

None. DEV already has WF1/WF2 rows from earlier E2E tests, which are handy for the browser checks.

## Requirements

- A party sees the recent activity of each of their loans on *My requests* / *Incoming requests*. An admin sees it on `/admin/loans`, with attempts and failure categories.
- Never return raw `automationLogs` rows. Never return `_id` of the log, `idempotencyKey`, `recipientId`, `lastStatusCode`, `nextAttemptAt`, `reminderDate` or raw `lastError` strings.
- Reads use the `by_loan` index, newest first, bounded. No `.filter`, no schema change.
- Plain-language copy for every kind × event × status, relative time that stays fresh, absolute date available without hover.
- Latest entry inline, the rest expandable. Empty, loading and error states. Fits 375px.
- convex-test coverage of the authorization matrix and the DTO mapping.

## Decisions

| # | Topic | Options considered | Decision and why |
|---|---|---|---|
| 1 | **Query shape** | (a) **Join** activity into `listMyRequests` / `listIncoming` / `admin.listLoans`; (b) **one batched query** `activity.forLoans({ loanIds })` per view; (c) **one query per card** `activity.forLoan({ loanId })` | **(c).** A subscribed Convex query re-runs whenever any document it read changes (Stack, *Queries that scale*: isolate frequently-updating data so other queries "won't be invalidated when that document is updated"). `automationLogs` is the most write-heavy table: every loan event inserts a row and every WF1 attempt patches it (`attempts`, `updatedAt`, `nextAttemptAt`), up to 5 patches per row. **(a)** would re-run the whole list (≤ 100 loans + `loadLoanRefs`) on each of those writes, and inside the paginated admin query it would re-run the affected page. **(b)** has the same over-invalidation at a smaller scale (one write re-reads every loan's logs, up to 100 × 10 rows), changes its args (= new subscription, full reload) every time the list gains a loan or "Load more" runs, and needs an id-count cap plus per-id authorization. **(c)** reads one loan + ≤ 10 log rows, so a write re-runs **only the card it belongs to**. The React client shares one WebSocket and de-duplicates identical subscriptions (`numSubscribers` in `convex/dist/esm/browser/sync/local_state.js`), and `"skip"` sends nothing. Authorization is the simplest possible (one id, one check), and the admin view's pagination needs no special handling. Cost: one query execution per visible card on load (≤ 100 on a party page, ≤ 50 per admin page). Each is tiny (≤ 12 reads, far below the 32,000 docs / 4,096 index ranges per-function limits). The Free plan includes 1M function calls/month; the docs don't say whether cached results count, so assume they do: at neighborhood scale this is negligible. If it ever matters, (b) can replace (c) without changing the DTO (sketch under *Convex Functions*). |
| 2 | **Rows per loan (N)** | (a) Latest only (`first()`); (b) `take(20)` (reminders spec hint); (c) `take(MAX_ACTIVITY_PER_LOAN = 10)` | **(c).** The write rules cap a loan at 3 notification + 7 reminder rows = 10, so 10 shows the **complete** history and still bounds the read if a future writer adds rows (newest 10 win). (a) can't power "show all". (b) is 2× the reads for rows that can't exist. Constant in `convex/lib/automationRules.ts`. |
| 3 | **Ordering** | (a) `by_loan` + `.order("desc")` (= `_creationTime` desc, the implicit last index column); (b) sort in memory by the display timestamp | **(a).** Convex appends `_creationTime` to every index, so `withIndex("by_loan", q => q.eq("loanId", id)).order("desc").take(10)` is newest-first with no new index. A row's creation time is when its event happened (`occurredAt` for notifications, first report for reminders), which is the order users expect. The display time can differ slightly (e.g. a notification sent 40 min later after retries); accepted. (b) would need to read all rows first; same rows, no gain. |
| 4 | **Cross-party visibility** | (a) Each party sees only rows addressed to them; (b) both parties see all rows of the loan, audience shown as a **role**; (c) as (b) but with the failure **reason** of the other party's rows hidden | **(c).** Seeing "Lender notified of the request · 3 h ago" is the reassurance the borrower wants (and the lender wants "Overdue reminder sent to borrower · 2 days ago", the overview's own example). Under (a) the borrower of a pending request would see nothing at all, and the lender would never see reminders. The audience is a role (`lender` / `borrower`), never a user id, and the parties already know each other's names on the card. What is **not** shared: *why* the other party's delivery failed. "No email on account" is a fact about the other person's account; the other party sees a generic "couldn't be delivered". The recipient sees their own reason because it's actionable (they can add an email to their account). |
| 5 | **Admin detail** | (a) Same DTO as parties; (b) + `attempts` + a failure **category** for every row; (c) + raw `lastError` / `lastStatusCode` / `nextAttemptAt` | **(b), via a separate `admin.loanActivity`.** Admins triage failures from `/admin/loans`, so they need to tell "user has no email" from "n8n not configured" from "n8n down" and to see how many tries happened. Categories (Decision 7) keep raw HTTP codes and internal codes off the client (coding-standards: never leak internal details); the precise row is one click away in the Convex dashboard. (c) duplicates the dashboard in the UI and exposes internals. A separate admin function keeps the existing pattern (`convex/admin.ts`: every handler starts with `requireAdmin`) and keeps `activity.forLoan` party-only. |
| 6 | **Display status** | (a) Three values `sent` / `retrying` / `failed` (pending → retrying); (b) four values, splitting `pending` by `attempts` | **(b): `sending` \| `retrying` \| `sent` \| `failed`.** `pending` with `attempts === 0` is the normal first few seconds of every notification: calling it "retrying" would look like an error on every new request. `pending` with `attempts > 0` is a real retry. Reminder rows are never `pending`. The raw `attempts` number stays admin-only. |
| 7 | **Which timestamp** | (a) Always `occurredAt`; (b) always `updatedAt`; (c) per status | **(c).** `sent` → `sentAt` (fallback `updatedAt`): when the email actually went out. `failed` → `updatedAt`: when it was given up (for reminders: the last report; for `event_budget` rows it equals `occurredAt`). `sending` / `retrying` → `occurredAt`: "since when are we trying". One field `at` in the DTO, so the client never has to choose. |
| 8 | **User-visible failure reasons** | (a) Show `lastError` verbatim; (b) everything collapsed into "couldn't be delivered"; (c) party: `no_email` (own rows only) else generic; admin: categories | **(c).** Party reason: `no_email` when the row is addressed to the viewer and `lastError === "no_email"`; otherwise `delivery_failed`. Admin category: `no_email`, `email_failed` (Gmail send failed in WF2), `not_configured`, `skipped` (`event_budget`), `service_error` (`http_*`, `timeout`, `network`, any unknown code), `internal` (`internal`, `loan_missing`). `retrying` rows carry no reason for parties; admins see the last attempt's category. (a) leaks internals (`http_401` hints at the secret setup). (b) hides the only reason a user can fix. |
| 9 | **Relative-time refresh** | (a) Reactive data only (time frozen until the row changes); (b) a `setInterval` per card; (c) one shared clock (`useNow`) built on `useSyncExternalStore`, ticking every 60 s while at least one subscriber is mounted | **(c).** (a) leaves "just now" on screen for hours. (b) creates up to 100 timers. (c) runs one interval for the whole page, re-renders only the `<RelativeTime>` leaves (each card's data is untouched), ticks once more when the tab becomes visible again, and stops when nothing is mounted. Formatting: `formatDistanceStrict(at, now, { addSuffix: true, roundingMethod: "floor" })` from date-fns (the `ToNow` variant reads the clock itself, so it couldn't share `now`); under 60 s → "just now"; future `at` (clock skew) is clamped to `now`. `floor` so "1 hour ago" is not shown at 31 minutes. English is date-fns' default locale (`enUS`), no locale import. No hydration risk: the activity renders only after a client `useQuery` result (the server render shows the views' skeletons). |
| 10 | **Absolute date + tooltip** | (a) shadcn/Base UI `Tooltip`; (b) `Popover`; (c) native `title` on `<time dateTime>` **plus** the absolute date as visible text in the expanded list | **(c).** Base UI: "tooltips are disabled on touch devices" and "a user should not miss critical information if they never see a tooltip". `title` gives desktop hover for free; touch and screen-reader users read the absolute date in the expanded list ("Nov 13, 2026, 2:05 PM"). `<time dateTime="2026-11-13T17:05:00.000Z">` (ISO from `new Date(at).toISOString()`) is the machine-readable value (MDN). (a) needs `npx shadcn add tooltip` for a desktop-only hint. (b) needs a component and a tap target per row for little gain. |
| 11 | **Expand pattern** | (a) Native `<details>` / `<summary>`; (b) shadcn `Collapsible` (`npx shadcn add collapsible`, Base UI primitive); (c) a "Show all" button with `useState` | **(a).** Built-in keyboard and screen-reader semantics (expanded/collapsed state is announced), no JS, no new component, works inside the existing `Card`. Styled with Tailwind (`[&::-webkit-details-marker]:hidden`, `group-open:` for the chevron rotation). (b) adds a component for the same behavior plus an animation (the only real advantage). (c) re-implements `aria-expanded`. If the user prefers the animation, (b) is a drop-in swap (*Decisions for the user*). |
| 12 | **Error handling on the client** | (a) `useQuery` (throws → `(app)/error.tsx` replaces the **whole page**); (b) `useQuery_experimental` (status object, documented as experimental); (c) `useQueries` with one entry (stable API, returns an `Error` instance instead of throwing) | **(c), wrapped in a typed hook.** A broken activity widget must not take down the loan list and its actions. `useQueries` is the stable, documented way to get errors as values; the hook casts the untyped result to `FunctionReturnType<…> \| undefined \| Error`. (b) would be nicer typed but is marked experimental and may change on upgrade. In normal use the only errors are FORBIDDEN after a role change or a server bug; they render "Activity unavailable". |
| 13 | **Non-party / unknown loan** | (a) Return `[]`; (b) throw FORBIDDEN / NOT_FOUND | **(b).** Same contract as `requireLoanParty` and every other function: explicit, testable, and leaks nothing (FORBIDDEN carries no loan data; `NOT_FOUND` only says the id doesn't exist, like `loans.approve`). The UI never asks for a loan outside the caller's own list, so (b) only fires on forged calls or races, and Decision 12 contains it. |

## DTO

```ts
// convex/lib/activity.ts
export const ACTIVITY_AUDIENCES = ["lender", "borrower"] as const;
export const ACTIVITY_STATUSES = ["sending", "retrying", "sent", "failed"] as const;
export const PARTY_REASONS = ["no_email", "delivery_failed"] as const;
export const ADMIN_REASONS = [
  "no_email", "email_failed", "not_configured", "skipped", "service_error", "internal",
] as const;

const activityBaseFields = {
  // stable React key, unique per loan: the event for notifications, `overdue:<reminderDate>` for reminders
  key: v.string(),
  kind: automationKindValidator,          // "notification" | "reminder"
  event: automationEventValidator,        // loan.<status> | loan.overdue
  audience: activityAudienceValidator,    // who the message was for, as a role
  status: activityStatusValidator,        // Decision 6
  at: v.number(),                         // epoch ms, Decision 7
};

export const activityItemValidator = v.object({
  ...activityBaseFields,
  reason: v.union(partyReasonValidator, v.null()),   // non-null only when status === "failed"
});

export const adminActivityItemValidator = v.object({
  ...activityBaseFields,
  attempts: v.number(),
  reason: v.union(adminReasonValidator, v.null()),   // failed: always; retrying: last attempt; else null
});

export type ActivityItem = Infer<typeof activityItemValidator>;
export type AdminActivityItem = Infer<typeof adminActivityItemValidator>;
```

The `key` is derived (`reminderDate` only appears inside it, as a UI key). It is not the log `_id` and not the `idempotencyKey` (no loan id inside).

### Mapping (server, pure helpers in `convex/lib/activity.ts`)

| Helper | Rule |
|---|---|
| `audienceOf(log, loan)` | `log.recipientId === loan.lenderId ? "lender" : "borrower"` |
| `displayStatus(log)` | `sent` → `sent`; `failed` → `failed`; `pending` → `attempts === 0 ? "sending" : "retrying"` |
| `activityAt(log)` | `sent` → `sentAt ?? updatedAt`; `failed` → `updatedAt`; else `occurredAt` |
| `activityKey(log)` | `notification` → `log.event`; `reminder` → `` `overdue:${log.reminderDate ?? log.occurredAt}` `` |
| `partyReason(log, audience, viewer)` | not `failed` → `null`; `failed` + `audience === viewer` + `lastError === "no_email"` → `"no_email"`; other `failed` → `"delivery_failed"` |
| `adminReason(log)` | `sent` / `sending` → `null`; else by `lastError`: `no_email` → `no_email`; `email_failed` → `email_failed`; `not_configured` → `not_configured`; `event_budget` → `skipped`; `internal`, `loan_missing` → `internal`; `http_*`, `timeout`, `network`, missing or unknown → `service_error` |

### Copy (client, `src/lib/activity.ts`)

`who` depends on the viewer: the viewer's own role → "you"; the other role → "the lender" / "the borrower"; admin view → "the lender" / "the borrower". Sentences start with a capital letter.

| kind / event | `sent` | `sending` | `retrying` | `failed` |
|---|---|---|---|---|
| notification / `loan.requested` | "{Who} {was/were} notified of the request" | "Notifying {who} of the request…" | "Still trying to notify {who} of the request" | "Couldn't notify {who} of the request" |
| notification / `loan.approved` | "… notified of the approval" | "Notifying {who} of the approval…" | "Still trying … of the approval" | "Couldn't notify {who} of the approval" |
| notification / `loan.rejected` | "… notified of the rejection" | idem | idem | idem |
| notification / `loan.cancelled` | "… notified of the cancellation" | idem | idem | idem |
| notification / `loan.returned` | "… notified that the tool was returned" | idem ("…that the tool was returned") | idem | idem |
| reminder / `loan.overdue` | "Overdue reminder sent to {who}" | — (never) | — (never) | "Overdue reminder to {who} failed" |

Examples: "You were notified of the request", "The lender was notified of the request", "Overdue reminder sent to you".

Reason suffix (after " · "):

| Reason | Party text | Admin text |
|---|---|---|
| `no_email` | own row: "No email address on your account" | "No email on account" |
| `delivery_failed` | "Couldn't be delivered" | — |
| `email_failed` | — | "Email send failed" |
| `not_configured` | — | "Automation not configured" |
| `skipped` | — | "Skipped (too many events at once)" |
| `service_error` | — | "Notification service error" |
| `internal` | — | "Internal error" |

Admin rows also append " · {n} attempt(s)" when `attempts > 0`.

Tone (existing tokens only, lucide icons, no new colors):

| Status | Icon | Text class |
|---|---|---|
| `sent` | `MailCheckIcon` | `text-muted-foreground` |
| `sending` / `retrying` | `ClockIcon` | `text-muted-foreground` |
| `failed` | `MailWarningIcon` | `text-destructive` |

Time: " · " + `<RelativeTime at={item.at} />` ("just now", "3 hours ago", "2 days ago").

## Convex Functions

| Function | Type | Who can call | Args | Returns |
|---|---|---|---|---|
| `activity.forLoan` | `query` (public) | Borrower or lender of the loan | `{ loanId: v.id("loans") }` | `v.array(activityItemValidator)`, ≤ 10, newest first |
| `admin.loanActivity` | `query` (public, `requireAdmin` first) | Admins | `{ loanId: v.id("loans") }` | `v.array(adminActivityItemValidator)`, ≤ 10, newest first |

Shared helper `loadLoanActivity(ctx, loanId)` in `convex/lib/activity.ts`:

```ts
return await ctx.db
  .query("automationLogs")
  .withIndex("by_loan", (q) => q.eq("loanId", loanId))
  .order("desc")
  .take(MAX_ACTIVITY_PER_LOAN);
```

Shape sketch (`convex/activity.ts`):

```ts
export const forLoan = query({
  args: { loanId: v.id("loans") },
  returns: v.array(activityItemValidator),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (loan === null) notFound("Loan not found.");
    const viewer =
      loan.borrowerId === me._id ? "borrower" : loan.lenderId === me._id ? "lender" : null;
    if (viewer === null) forbidden("You can't see this loan's activity.");
    const logs = await loadLoanActivity(ctx, loanId);
    return logs.map((log) => toActivityItem(log, loan, viewer));
  },
});
```

`admin.loanActivity`: `requireAdmin` → `ctx.db.get(loanId)` → `notFound` → `loadLoanActivity` → `toAdminActivityItem`. Both functions read no other table. The authorization check runs before any `automationLogs` read. No `Date.now()` in either query (relative time is computed on the client).

**Alternative kept on file (Decision 1 (b)), not implemented:** `activity.forLoans({ loanIds: v.array(v.id("loans")) })`, reject when `loanIds.length > MAX_LOAN_LIST` (100), de-duplicate, `requireUser` once, then for each id load the loan and **throw FORBIDDEN if any** is not the caller's (no partial results), return `Record<loanId, ActivityItem[]>`. Reads ≤ 100 loans + ≤ 1,000 rows (within limits). Tests would add: 101 ids rejected, one foreign id among own ids → FORBIDDEN, duplicates read once.

## Authorization Matrix

| Caller | `activity.forLoan` (own loan) | `activity.forLoan` (someone else's loan) | `admin.loanActivity` |
|---|---|---|---|
| Visitor (signed out) | UNAUTHENTICATED | UNAUTHENTICATED | UNAUTHENTICATED |
| Signed in, `users` row not stored yet | UNAUTHENTICATED | UNAUTHENTICATED | UNAUTHENTICATED |
| Borrower | ✅ all rows; own failure reasons; other party's failures → `delivery_failed` | — | FORBIDDEN |
| Lender | ✅ same rule from the lender side | — | FORBIDDEN |
| Unrelated user | — | FORBIDDEN | FORBIDDEN |
| Admin | ✅ when they are a party (same as above) | FORBIDDEN (use the admin view) | ✅ any loan, admin DTO |
| Any caller, unknown loan id | NOT_FOUND | NOT_FOUND | NOT_FOUND (after `requireAdmin`) |
| Any caller, malformed id | argument validation error (`v.id`) | idem | idem |

## Routes and UI

No new route. Pages unchanged (`/loans/requests`, `/loans/incoming`, `/admin/loans` keep `await auth.protect()` and `AdminGate`).

| Component | Path | Responsibility |
|---|---|---|
| `LoanActivity` | `src/components/activity/LoanActivity.tsx` | Client. Props `{ loanId, viewer: "borrower" \| "lender" }`. `useLoanActivity(api.activity.forLoan, loanId)`; renders states + `ActivityList` |
| `AdminLoanActivity` | `src/components/activity/AdminLoanActivity.tsx` | Client. Same with `api.admin.loanActivity`, `viewer: "admin"` |
| `ActivityList` | `src/components/activity/ActivityList.tsx` | Separator, heading-less block: latest entry inline; `<details>` "Show all activity (N)" with the older entries when N > 1 |
| `ActivityEntry` | `src/components/activity/ActivityEntry.tsx` | Icon + label + reason + `RelativeTime`; `showAbsolute` prop adds the absolute date as small text (used inside `<details>`) |
| `RelativeTime` | `src/components/activity/RelativeTime.tsx` | `<time dateTime={iso} title={absolute}>{relative}</time>` using `useNow()` |
| `useNow` | `src/hooks/useNow.ts` | Shared 60 s clock (`useSyncExternalStore`, one interval, `visibilitychange` re-tick, server snapshot `null` → render the absolute date) |
| `useLoanActivity` | `src/hooks/useLoanActivity.ts` | `useQueries({ activity: { query, args: { loanId } } })` → typed `T \| undefined \| Error` |
| `LoanCard` | `src/components/loans/LoanCard.tsx` | New optional `activity?: ReactNode` slot rendered at the end of `CardContent` (after `meta`) |

Wiring: `MyRequestsView` → `activity={<LoanActivity loanId={loan._id} viewer="borrower" />}`; `IncomingRequestsView` → `viewer="lender"`; `AdminLoansView` → `<AdminLoanActivity loanId={loan._id} />`. The parent views already skip their list query until the user (or admin role) is known, so the cards, and their activity queries, mount only after that.

States:

| State | Render |
|---|---|
| Loading (`undefined`) | `Skeleton` `h-4 w-40` (one line, keeps card height stable) |
| Error (`Error` instance) | muted "Activity unavailable" (no message text, no toast: background widget) |
| Empty (`[]`) | muted "No automated messages yet" (loans created before WF1 existed, or `not_configured` environments still create rows, so empty is rare) |
| Data | latest entry; `<details>` when length > 1 |

Mobile (375px): entries wrap (`break-words`, `min-w-0`), icon `shrink-0` aligned to the first line, the " · time" part allowed to wrap to a second line; `<summary>` has a ≥ 24px tap height (`py-1`). No horizontal scroll. The expanded list shows the absolute date as text, so touch users never need hover.

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `convex/lib/activity.ts` | create | Validators/types (DTOs, audiences, statuses, reasons), `loadLoanActivity`, `audienceOf`, `displayStatus`, `activityAt`, `activityKey`, `partyReason`, `adminReason`, `toActivityItem`, `toAdminActivityItem` |
| `convex/lib/activity.test.ts` | create | Pure mapping tests |
| `convex/activity.ts` | create | `forLoan` |
| `convex/activity.test.ts` | create | convex-test: auth matrix, DTO, order, bound |
| `convex/admin.ts` | modify | `loanActivity` |
| `convex/admin.test.ts` | modify | `loanActivity` cases |
| `convex/lib/automationRules.ts` | modify | `MAX_ACTIVITY_PER_LOAN = 10` |
| `src/lib/activity.ts` | create | Copy (`activityLabel`, `reasonLabel`), `formatRelative(at, now)`, `formatAbsolute(at)` (`format(at, "PPp")` → "Nov 13, 2026, 2:05 PM") |
| `src/lib/activity.test.ts` | create | Copy table + `formatRelative` edges (utility test, like `src/lib/loans.test.ts`) |
| `src/types/activity.ts` | create | `ActivityItem` / `AdminActivityItem` via `FunctionReturnType` |
| `src/hooks/useNow.ts`, `src/hooks/useLoanActivity.ts` | create | See above |
| `src/components/activity/*.tsx` | create | See above |
| `src/components/loans/LoanCard.tsx` | modify | `activity` slot |
| `src/components/loans/MyRequestsView.tsx`, `IncomingRequestsView.tsx`, `src/components/admin/AdminLoansView.tsx` | modify | Pass the activity component |
| `context/project-overview.md` | modify | Data model comment: `automationLogs` read only through `activity.forLoan` / `admin.loanActivity` (projected DTO); feature F implemented |

No schema change, no new index, no npm package, no shadcn component.

## Manual Steps (User)

DEV, translation off, `npx convex dev` + `npm run dev` running, WF1 `[DEV]` published. Accounts: **A** (lender), **B** (borrower), **Admin**. Keep two browser profiles open side by side to watch reactivity.

1. **Request → notification:** B requests A's Drill. B's card (*My requests*) shows "Notifying the lender of the request…" then, within seconds and without reload, "The lender was notified of the request · just now". A's card (*Incoming*) shows "You were notified of the request". A's Gmail got the `[DEV]` email.
2. **Approve → second entry:** A approves. Both cards show the approval entry inline and "Show all activity (2)". Expand it: two entries, absolute dates visible as text. Hover a time on desktop → the `title` shows the absolute date.
3. **Relative time ticks:** leave the page open 2+ minutes: "just now" → "1 minute ago" → "2 minutes ago" without reload.
4. **Retrying is visible:** unpublish WF1 in n8n, then B makes a new request. B sees "Still trying to notify the lender of the request" after the first 404. Publish WF1 again → it flips to "was notified" after the next retry (≤ 2 min).
5. **Failure, party vs admin:** Convex dashboard (DEV) → *Data* → `automationLogs` → pick a `sent` row of a loan between A and B addressed to B (e.g. `loan.approved`) and set `status: "failed"`, `lastError: "no_email"`. B sees "Couldn't notify you of the approval · No email address on your account". A sees "Couldn't notify the borrower of the approval · Couldn't be delivered". Admin (`/admin/loans`) sees "… · No email on account · 1 attempt". Change `lastError` to `http_500` → B sees "Couldn't be delivered", Admin sees "Notification service error". Restore the row afterwards (or leave it: DEV data).
6. **Reminder row:** make an approved A↔B loan overdue (dashboard: past `startDate` / `endDate`, keep `approved`) and run `[DEV]` WF2 manually (*Execute workflow*). B sees "Overdue reminder sent to you · just now", A sees "Overdue reminder sent to the borrower". Admin sees the same entry with "1 attempt".
7. **Unrelated user:** a third account C opens *My requests* / *Incoming*: none of A/B's loans appear (nothing to test in the UI; the FORBIDDEN path is covered by convex-test).
8. **Admin view:** `/admin/loans` with "Load more": activity appears on the new cards as they load; filters still work.
9. **375px:** DevTools device mode on all three pages: no horizontal scroll, `<summary>` tappable, expanded entries wrap.

## Implementation Steps (Claude)

All against DEV.

1. Branch `feature/automation-activity` from `main`.
2. `MAX_ACTIVITY_PER_LOAN`; `convex/lib/activity.ts` + `convex/lib/activity.test.ts`.
3. `convex/activity.ts`, `admin.loanActivity`; `convex/activity.test.ts`, `admin.test.ts` additions. `npx convex dev` pushes (no schema change). `npm run test:run`.
4. `src/lib/activity.ts` + test, `src/types/activity.ts`, `useNow`, `useLoanActivity`.
5. Components, `LoanCard` slot, wire the three views.
6. Walk the user through *Manual Steps*; check 375px.
7. Update `context/project-overview.md`.
8. `npm run lint`, `npm run test:run`, `npm run build`.
9. Run **auth-auditor** on `convex/activity.ts`, `convex/lib/activity.ts`, `convex/admin.ts`. Fix critical/high.
10. Ask before committing. Go through *PROD Impact* before merging.

## PROD Impact

- **Schema:** none. **Indexes:** none.
- **Functions:** two new public queries (`activity:forLoan`, `admin:loanActivity`). Read-only, behind `requireUser` / `requireAdmin`. Additive: the old PROD frontend doesn't call them, so the deploy order (Convex first, then Next.js) is safe.
- **Data shown:** PROD has real `automationLogs` rows (including the first WF1 PROD event, `failed` / `http_401`, from the PROD setup). Its parties will see "Couldn't notify … · Couldn't be delivered" on that loan; the admin will see "Notification service error". Expected and true.
- Rollback: Vercel Instant Rollback for the UI; revert the commit on `main` to remove the queries (no data to migrate).

Before merging:

- [ ] `npm run build` / `lint` / `test:run` pass
- [ ] DEV manual steps 1–9 done
- [ ] auth-auditor: no critical/high findings
- [ ] User confirms the merge

## Acceptance Criteria

- [ ] `activity.forLoan` returns the loan's activity to its borrower and lender only; UNAUTHENTICATED for visitors / unstored users, FORBIDDEN for anyone else (including non-party admins), NOT_FOUND for unknown ids
- [ ] `admin.loanActivity` works for admins on any loan; UNAUTHENTICATED / FORBIDDEN otherwise
- [ ] Both read only `loans` (one `get`) and `automationLogs` via `by_loan`, `.order("desc")`, `take(10)`; no `.filter`, no schema change
- [ ] DTO keys exactly `key, kind, event, audience, status, at, reason` (+ `attempts` for admin); no `_id`, `idempotencyKey`, `recipientId`, `lastStatusCode`, `nextAttemptAt`, `reminderDate`, `lastError`, `occurredAt`, `updatedAt`, `sentAt`, `loanId`
- [ ] Mapping follows the tables (status, timestamp, reasons, cross-party reason hiding)
- [ ] Cards on *My requests*, *Incoming requests* and `/admin/loans` show the latest entry inline and the rest in `<details>`; loading / empty / error states; relative time refreshes every minute; absolute date in `title` and as text in the expanded list; `<time dateTime>` ISO
- [ ] An activity error never replaces the page (renders "Activity unavailable")
- [ ] Fits 375px without horizontal scroll
- [ ] No new npm package / shadcn component. `npm run lint`, `npm run test:run`, `npm run build` pass
- [ ] auth-auditor: no critical/high findings. No `--prod` command run

## Testing

### `convex/activity.test.ts` (convex-test)

Fixtures like `loans.test.ts` / `notifications.test.ts`: Alice (lender), Bob (borrower), Dave (unrelated user), Carol (admin), Drill; `vi.stubEnv("N8N_WEBHOOK_URL", "")` so real loan events create `failed` / `not_configured` rows without `fetch`. Extra rows inserted with `t.run` (`insertLog(loanId, overrides)`), with controlled `_creationTime` order (insert in sequence; fake timers for `occurredAt` / `sentAt`).

**Authorization**
- No identity → UNAUTHENTICATED; identity without `users` row → UNAUTHENTICATED
- Dave on Alice↔Bob's loan → FORBIDDEN; the error carries no loan data
- Carol (admin, not a party) on `activity.forLoan` → FORBIDDEN
- Unknown loan id (deleted via `t.run`) → NOT_FOUND
- Bob and Alice → 200 with the same entries (same `key`s, `audience`s)

**Visibility / reasons**
- Row to Bob `failed` / `no_email`: Bob → `reason: "no_email"`; Alice → `"delivery_failed"`
- Row to Alice `failed` / `no_email`: Alice → `no_email`; Bob → `delivery_failed`
- `failed` / `email_failed`, `not_configured`, `http_401`, `timeout`, `event_budget` → `delivery_failed` for both parties
- `pending` rows → `reason: null`

**DTO**
- `Object.keys(item).sort()` equals `["at","audience","event","key","kind","reason","status"]`; `JSON.stringify(result)` contains neither the `idempotencyKey`, the `recipientId`, nor the log `_id`
- Notification `loan.requested` → `audience: "lender"`; `loan.approved` → `"borrower"`; reminder → `"borrower"`, `key: "overdue:<date>"`
- `pending` + `attempts: 0` → `sending`, `at = occurredAt`; `pending` + `attempts: 2` → `retrying`; `sent` → `at = sentAt`; `failed` → `at = updatedAt`

**Order / bound**
- 3 notification rows + 2 reminder rows → 5 items, newest `_creationTime` first
- 12 rows → exactly 10, the newest 10
- Rows of another loan never appear

**Real flow**
- `loans.request` + `approve` (WF1 not configured → both rows `failed` / `not_configured` after `finishAllScheduledFunctions`) → Bob sees 2 entries, `approved` first: `approved` (audience `borrower`) and `requested` (audience `lender`), both `failed` / `delivery_failed`
- Reminder recorded through `internal.reminders.recordReminder` (`sent`) → appears as `reminder` / `loan.overdue` / `sent`

### `convex/admin.test.ts` (additions)

- Visitor → UNAUTHENTICATED; Bob (party, not admin) → FORBIDDEN; Carol → items with `attempts`
- Admin reasons: `no_email` → `no_email`, `email_failed` → `email_failed`, `not_configured` → `not_configured`, `event_budget` → `skipped`, `http_500` / `timeout` / `network` / `"weird"` → `service_error`, `internal` / `loan_missing` → `internal`; `retrying` row with `lastError: "http_404"` → `service_error`; `sent` → `null`
- Keys exactly the party keys + `attempts`
- Unknown loan → NOT_FOUND

### Unit

- `convex/lib/activity.test.ts`: every helper in the mapping table, table-driven
- `src/lib/activity.test.ts`: copy for each kind × event × status × viewer (`borrower`, `lender`, `admin`); `formatRelative`: 0 s / 59 s → "just now", 61 s → "1 minute ago", 90 min → "1 hour ago" (floor), 2 days → "2 days ago", future `at` → "just now"

No component tests (coding standards).

## Out of Scope

- Resending failed notifications or reminders, any manual "retry" button, a stale-`pending` sweeper
- Changes to n8n workflows, HTTP endpoints, `automationLogs` write paths or schema
- An admin "automation health" page (`by_kind_status` = `failed`)
- In-app notifications (bell, unread counts), per-user notification preferences
- Layout colors / theme and the README (final spec)
- PROD: nothing beyond the normal `main` deploy

## Decisions for the User to Review

1. **Per-card query** (Decision 1) instead of a batched query or joining into the lists.
2. **Cross-party visibility** (Decision 4): both parties see all rows; the other party's failure reason is hidden.
3. **Admin detail** (Decision 5): `attempts` + a failure category, via a separate `admin.loanActivity`; no raw codes.
4. **Visible reasons** (Decision 8): parties see only `no_email` (own rows); everything else is "Couldn't be delivered".
5. **N = 10** (Decision 2).
6. **Four display statuses** (Decision 6): adds `sending` to the requested `sent` / `retrying` / `failed`.
7. **Shared 60 s clock** (Decision 9).
8. **No new shadcn component** (Decisions 10–11): native `<details>` + `title`. Optional swap: `npx shadcn add collapsible` for an animated expand.

## Doc Conflicts

| Topic | Conflict | Followed |
|---|---|---|
| Query shape | `loan-notifications.md` *Hooks* and `overdue-reminders.md` *Hooks*: load activity "for the visible page only (like `loadLoanRefs`)", i.e. joined or batched | Per-card query (Decision 1): narrower invalidation, simpler authorization |
| Rows per loan | `overdue-reminders.md`: "≤ 5 notifications + ≤ 7 reminder days", "`take(20)` is enough" | The write rules allow ≤ 3 notification rows per loan (one per event key, at most `requested` + one decision + `returned`), so ≤ 10 rows; `take(10)` |
| Exposed fields | `overdue-reminders.md` hook: expose `occurredAt`, `sentAt`, `reminderDate`; `loan-notifications.md` hook: `sentAt`, `occurredAt` | One derived `at` + a derived `key` (Decision 7); raw timestamps and `reminderDate` stay server-side |
| Render slot | `loan-notifications.md` hook: render in `LoanCard`'s `meta` slot | `meta` is already used by the admin view; a dedicated `activity` slot is added |
| Error codes | `overdue-reminders.md` hook: "never `lastError` codes verbatim" | Followed; parties see two reasons, admins see six categories |
| Display statuses | Task brief: `sent` / `retrying` / `failed` | Adds `sending` (Decision 6) |
| Tooltip | Task brief mentions a tooltip | Base UI tooltips are disabled on touch; `title` + visible absolute date instead (Decision 10) |
| useQuery errors | Convex React docs: `useQuery` throws; `useQueries` returns `Error` instances; `useQuery_experimental` returns a status object | `useQueries` (stable API) behind a typed hook (Decision 12) |
| Subscription de-duplication | Convex React docs don't state it | Confirmed in the installed client source (`local_state.js`, `numSubscribers`) |
| Function-call billing | Pricing page doesn't say whether cached query results count | Assumed they count; negligible at this scale (Decision 1) |

## References

- Convex — React client (`useQuery`, `"skip"`, consistency across queries, `useQuery_experimental`): https://docs.convex.dev/client/react
- Convex — `convex/react` API (`useQueries` returns `undefined` / result / `Error`; `useQuery_experimental` `throwOnError`): https://docs.convex.dev/api/modules/react
- Convex — Query functions (automatic caching, deterministic, subscriptions): https://docs.convex.dev/functions/query-functions
- Convex — Indexes (`_creationTime` is the implicit last column; `.order("desc")` with `withIndex`): https://docs.convex.dev/database/reading-data/indexes/
- Convex — Limits (32,000 docs scanned, 16 MiB read, 4,096 index ranges per function; 8,192 array elements; 16 MiB args): https://docs.convex.dev/production/state/limits
- Convex Stack — Queries that scale (re-runs on any read document change; isolate frequently-updating data): https://stack.convex.dev/queries-that-scale
- Convex — Pricing (Free plan: 1M function calls/month): https://www.convex.dev/pricing
- date-fns — `formatDistanceStrict` / `formatDistanceToNowStrict` (`addSuffix`, `roundingMethod`; `ToNow` is a wrapper reading the current time): https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/formatDistanceStrict/index.ts · https://github.com/date-fns/date-fns/blob/main/pkgs/core/src/formatDistanceToNowStrict/index.ts
- Base UI — Tooltip (disabled on touch; don't hide critical info; Popover for important descriptions): https://base-ui.com/react/components/tooltip
- MDN — `<time>` and `datetime` formats: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/time
- Local package sources (read 2026-11-15): `node_modules/convex/dist/esm/browser/sync/local_state.js` (subscriptions de-duplicated by query token, `numSubscribers`), `node_modules/convex/dist/esm-types/react/use_queries.d.ts` and `client.d.ts` (`useQueries`, `useQuery_experimental` in 1.49.0); `components.json` (`base-nova`) and `src/components/ui/` (installed components)
- Project: `CLAUDE.md`, `context/project-overview.md`, `context/coding-standards.md`, `context/ai-interaction.md`, `context/current-feature.md`, `context/features/loan-notifications.md`, `context/features/overdue-reminders.md`; code in `convex/` and `src/` (read 2026-11-15)

Source notes: Context7 was used for the Convex React API and date-fns; the live docs above confirmed limits, indexes and tooltip guidance. Where the Convex docs were silent (subscription de-duplication), the installed `convex` 1.49.0 source was followed.
