# Loans — Requests, Approval and Return (DEV)

## Overview

Signed-in users borrow tools from each other:

- a **`loans`** table (tool, borrower, lender, whole-day period, status, timestamps) with indexes for every query below
- a server-validated **status machine**: `pending → approved | rejected | cancelled`, `approved → returned`
- mutations **`request`**, **`cancel`** (borrower), **`approve`** / **`reject`** / **`markReturned`** (lender), each guarded inside Convex
- **overlap protection**: two approved loans of the same tool never share a day (checked on request and re-checked on approve, inside a serializable transaction)
- queries **My requests** (borrower) and **Incoming requests** (lender), each with tool name and the counterpart as `publicUser`; plus `bookedPeriods` (dates only) so the request form can show what is taken
- **real availability**: `getAvailability` now derives `available` / `on_loan` from approved loans; removing a tool auto-rejects its pending requests and is blocked while it is lent out
- reusable **overdue** helper and a single **transition helper** that the automation spec will hook into (no n8n, no HTTP endpoint now)
- UI: "Request" dialog on the All tools board (native date inputs), `/loans/requests` and `/loans/incoming`, status badges, toasts, mobile layout
- convex-test coverage for authorization, transitions, overlap, availability

Targets the **DEV environment**. Schema and functions reach Convex **prod** on the next `main` push (see *PROD Impact*).

## Prerequisites

Already done (see `context/current-feature.md` → *History*):

- `users` (`tokenIdentifier`, `name`, `email?`, `role`, `isTrustedLender`) + `requireUser` / `requireAdmin` / `getCurrentUser` in `convex/lib/auth.ts`
- `ConvexError` payload `AppErrorData { code, message }` with codes `UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND` / `INVALID_ARGUMENT` (`convex/lib/errors.ts`); client `getErrorMessage(error)` + Sonner toasts
- `publicUser` projection + `publicUserValidator` (`convex/lib/users.ts`) — **never return raw `users` docs**; email is display-only
- `tools` table (`ownerId`, `name`, `category`, `condition`, `description`, `isActive` soft delete; indexes `by_active_category`, `by_owner_active`); `ownerId` is never patched after insert
- Extension points in `convex/lib/tools.ts`: `getAvailability(ctx, tool)` (returns `"available"`), `deactivateTool(ctx, tool)` (patches `isActive: false`), `requireOwnedActiveTool`
- `availabilityValidator = "available" | "on_loan"` + `AVAILABILITY_LABELS`; `ToolCard` already renders the badge and has an `actions` slot
- Lists bounded with `.take` (`MAX_BOARD_TOOLS = 200`, `MAX_OWN_TOOLS = 100`); no `.filter` on DB queries
- `(app)` route group: `AppHeader` (nav links), `<Suspense>` in the layout, `error.tsx`; **every `page.tsx` starts with `await auth.protect()`**
- Client queries pass `"skip"` until `useCurrentUser().user` exists (functions use `requireUser`)
- Installed: `date-fns` 4.4, `zod` 4.6, `@base-ui/react` 1.9; shadcn UI: `button`, `badge`, `card`, `dialog`, `alert-dialog`, `field`, `input`, `label`, `select`, `separator`, `skeleton`, `sonner`, `textarea`. **`react-day-picker` is not installed.**
- Testing gotcha: Chrome auto-translate breaks React DOM updates — test with translation off

## Requirements

- `loans` table + validators + indexes (Data Model)
- Status machine enforced by one helper; every invalid transition throws `ConvexError` (`CONFLICT`)
- `request`: signed-in user, active tool, **not own tool**, valid period, no overlap with an **approved** loan, no overlapping open request by the same borrower on the same tool, per-borrower cap on pending requests
- `approve` / `reject`: lender only; `approve` re-checks overlap and auto-rejects overlapping pending requests in the same transaction
- `cancel`: borrower only, `pending` only
- `markReturned`: lender only, `approved` only
- Queries `listMyRequests`, `listIncoming`, `bookedPeriods` — never return loans the caller is not a party to
- `getAvailability` from real loans; `deactivateTool` rules for open loans
- Pure overdue helper (`isOverdue`) usable by the reminders spec
- Pages `/loans/requests`, `/loans/incoming` (with `auth.protect()`), Request dialog on `/tools`; loading / empty / error states; toasts; mobile width
- convex-test coverage (see *Testing*)

## Decisions

| # | Topic | Options considered | Decision and why |
|---|---|---|---|
| 1 | **Date representation** | (a) epoch ms (`v.number()`) for start/end; (b) `YYYY-MM-DD` strings (`v.string()`); (c) day numbers (days since epoch) | **(b) ISO date strings, inclusive whole days.** A loan is "Nov 14 → Nov 16", not instants: (a) forces picking a time-of-day and a timezone for each boundary (the Convex runtime is UTC, users are not — "midnight Nov 14" in São Paulo is Nov 14 03:00 UTC), and off-by-one bugs appear at every display and comparison. `YYYY-MM-DD` has **no timezone**, sorts **lexicographically = chronologically** (so index range operators `lte`/`gte` work on it), is exactly what `<input type="date">` produces, and is readable in the dashboard and in n8n payloads. (c) is compact but unreadable everywhere. Validation: regex `^\d{4}-\d{2}-\d{2}$` **plus** a round-trip through `Date.UTC` (rejects `2026-02-30`), in a pure helper `parseIsoDate` (no date-fns on the server — keeps the Convex bundle small and the helper trivially testable). Timestamps of events (`decidedAt`, `returnedAt`, …) are epoch ms from `Date.now()` (mutations only). |
| 2 | **What is "today"** | (a) `Date.now()` inside queries; (b) client passes `today` as a query argument; (c) a stored flag flipped by a scheduled job | **Queries: (b). Mutations: server UTC date with ±1 day tolerance.** Convex best practices: a query is **not** re-run when `Date.now()` changes (stale results) and time-dependent queries are invalidated often; the documented alternatives are a scheduled flag (c) or passing the time as an argument rounded for caching (b). (c) needs a cron and extra writes for a purely presentational state. (b) with a **day-granularity** string is perfectly cache-friendly (same args all day) and uses the **user's local day**, which is what a whole-day loan means. A malicious `today` only changes the caller's own view (availability badge), never data. A client hook `useToday()` returns the local `YYYY-MM-DD` and re-renders at local midnight. For `/` (server `preloadQuery`), the Next.js server computes `today` in UTC — off by at most a few hours around midnight for a read-only badge filter; accepted. **Mutations** may use `Date.now()` (deterministic per call, no cache): "not in the past" is `startDate >= utcToday − 1 day` so users west of UTC can still book their local today (UTC−12…+14). |
| 3 | **Do pending requests block a period?** | (a) Pending and approved both block; (b) only approved blocks; on approve, overlapping pending requests are auto-rejected; (c) only approved blocks; overlapping pending requests stay and fail when the lender tries to approve them | **(b).** (a) lets one borrower squat a period with a request the lender never answers, and the lender loses the ability to choose between neighbors. (c) leaves the lender with requests that can no longer be approved and borrowers waiting on a dead request. (b) keeps the lender in control, and each borrower gets a definitive answer: when one request is approved, every other **pending** request of the same tool that overlaps it becomes `rejected` with `closeReason: "period_taken"` in the same transaction. Guard rails: a borrower cannot have two **open** (pending/approved) overlapping loans on the same tool (`CONFLICT`), and at most `MAX_PENDING_PER_BORROWER = 10` pending requests overall (`INVALID_ARGUMENT`). |
| 4 | **Cancel by the borrower** | (a) No cancel; (b) `pending → cancelled` by the borrower; (c) also `approved → cancelled` before the start date | **(b), minimal.** Without it a borrower who requested the wrong dates is stuck: the duplicate rule (Decision 3) blocks re-requesting and the lender's inbox keeps a stale request. Reusing `rejected` for this would make history lie ("the owner rejected you"). (c) is deferred: an approved loan that will not happen can be closed by the lender with `markReturned` (Decision 5), and adding a second path for approved loans doubles the notification cases for the automation spec. |
| 5 | **Who marks a loan returned** | (a) Borrower; (b) lender; (c) either | **(b) lender only.** The lender is the party that can confirm the tool is physically back; letting the borrower close it (a/c) would let a borrower silence overdue reminders without returning anything — the reminders spec relies on `returned` meaning "the owner has it". Allowed any time while `approved`, including before `startDate` (lets the lender close an approved loan that won't happen; `returnedAt` records when). |
| 6 | **Deactivating a tool with loans** | (a) Allow, leave loans as they are; (b) block if any pending/approved loan; (c) block only during an **approved, not returned** loan; auto-reject pending requests | **(c), inside `deactivateTool`.** (a) leaves approved loans for a tool nobody can see and pending requests that can never be decided (the lender's approve path requires an active tool). (b) lets any borrower prevent an owner from removing a listing just by requesting it. (c): if the tool has an `approved` loan (any dates — the item is out or promised), throw `CONFLICT` "Mark the loan as returned (or close it) before removing this tool."; otherwise every `pending` loan of the tool becomes `rejected` with `closeReason: "tool_removed"`, then `isActive: false`. Same helper for the future admin removal (the admin spec decides whether admins may force it). |
| 7 | **Denormalize `lenderId` on the loan** | (a) Read `tools.ownerId` each time; (b) store `lenderId` on the loan | **(b).** "Incoming requests" needs an index by lender; without `lenderId` it would be "find my tools, then loans per tool" (N queries, bounded only by `MAX_OWN_TOOLS`, and it would miss loans of removed tools). Convex guidance: store the parent id on the child and index it; the cost of denormalization is keeping copies in sync — here the copy can **never drift** because `tools.ownerId` is written once at insert and never patched. Tool **name** is *not* copied: the tool row survives soft delete, so lists read it with `ctx.db.get` (deduplicated). |
| 8 | **Date input** | (a) shadcn base-nova `Calendar` + `Popover` date-range picker; (b) two native `<input type="date">` with the shadcn `Input` | **(b) native inputs.** The base-nova `calendar` registry item depends on **`react-day-picker@latest`** (+ `date-fns`, `button`) and the date picker also needs `popover` — a new runtime dependency and two new UI components for one form. Native inputs: zero dependencies, the OS picker on mobile (best UX at 375px), value is already `YYYY-MM-DD` (Decision 1), `min`/`max` attributes enforce today and the 180-day horizon. Trade-off: no disabled "booked" days inside the picker — mitigated by listing the booked periods under the inputs (`bookedPeriods`). Upgrade path: swap in the Calendar range picker later without touching Convex. |
| 9 | **Availability states** | (a) `available` / `on_loan` (existing validator); (b) add `requested`; (c) per-period availability on the board | **(a), definition changes only.** `on_loan` = the tool has an `approved` loan whose `startDate <= today` (dates past `endDate` still count: an overdue tool is still with the borrower). Future approved loans don't make a tool unavailable today; the request form shows booked periods instead (c is what `bookedPeriods` gives, per tool). (b) would expose that someone asked for a tool and adds a badge state with no action attached (pending requests don't block, Decision 3). No validator change → no change to `tools.*` return types or `ToolCard`. |
| 10 | **Concurrency** | (a) Trust the check-then-insert; (b) add a lock document per tool | **(a) is safe in Convex.** Mutations are serializable transactions with OCC; the read set records the **index ranges** scanned, and at commit the transaction aborts and retries if a concurrent write would have changed any of those reads. The overlap query reads the range `by_tool_status_start [toolId, "approved", ≤ endDate]`, so two concurrent approves of overlapping loans cannot both commit: the second retries, sees the first, and throws `CONFLICT`. No lock document (b) — it would also create a hot document. Keep the range narrow (one tool, one status) so unrelated loans never conflict. |
| 11 | **Period limits** | Unlimited vs caps | `MAX_LOAN_DAYS = 30` (inclusive length), `MAX_ADVANCE_DAYS = 180` (latest `startDate` from server UTC today), `startDate <= endDate` (single-day loans allowed). Constants in `convex/lib/loanRules.ts`, imported by the client form. |

## Data Model

```ts
// convex/lib/validators.ts (additions)
export const LOAN_STATUSES = ["pending", "approved", "rejected", "cancelled", "returned"] as const;
export const loanStatusValidator = v.union(
  v.literal("pending"), v.literal("approved"), v.literal("rejected"),
  v.literal("cancelled"), v.literal("returned"),
);
// why a pending loan was closed by the system (absent = closed by a person)
export const loanCloseReasonValidator = v.union(v.literal("period_taken"), v.literal("tool_removed"));

export type LoanStatus = Infer<typeof loanStatusValidator>;
export type LoanCloseReason = Infer<typeof loanCloseReasonValidator>;
```

```ts
// convex/schema.ts (addition)
loans: defineTable({
  toolId: v.id("tools"),
  borrowerId: v.id("users"),
  lenderId: v.id("users"),           // = tool.ownerId at request time (never changes, Decision 7)
  startDate: v.string(),             // "YYYY-MM-DD", inclusive
  endDate: v.string(),               // "YYYY-MM-DD", inclusive, >= startDate
  status: loanStatusValidator,
  decidedAt: v.optional(v.number()),   // approve / reject (incl. auto-reject), epoch ms
  cancelledAt: v.optional(v.number()),
  returnedAt: v.optional(v.number()),
  closeReason: v.optional(loanCloseReasonValidator),
})                                   // requested at = _creationTime
  .index("by_tool_status_start", ["toolId", "status", "startDate"])
  .index("by_borrower", ["borrowerId"])
  .index("by_borrower_status", ["borrowerId", "status"])
  .index("by_lender", ["lenderId"])
  .index("by_status_end", ["status", "endDate"]),
```

| Index | Used by | Range |
|---|---|---|
| `by_tool_status_start` | overlap check (`request`, `approve`), `getAvailability`, `bookedPeriods`, `deactivateTool`, auto-reject on approve | `eq(toolId).eq("approved").lte("startDate", end)` then `endDate >= start` in code (only approved loans of one tool — small); `eq(toolId).eq("pending")` |
| `by_borrower` | `listMyRequests` | `eq(borrowerId)`, `.order("desc")` (newest first), `.take(MAX_LOAN_LIST)` |
| `by_borrower_status` | pending cap in `request` | `eq(borrowerId).eq("pending")`, `.take(MAX_PENDING_PER_BORROWER)` |
| `by_lender` | `listIncoming` | `eq(lenderId)`, `.order("desc")`, `.take(MAX_LOAN_LIST)` |
| `by_status_end` | `listOverdue` helper (reminders spec, admin) | `eq("approved").lt("endDate", today)` |

`by_borrower` and `by_borrower_status` are both kept on purpose: Convex calls `by_foo` + `by_foo_and_bar` redundant **unless a different sort order is needed** — the list needs newest-first across all statuses, the cap needs one status.

Rules (`convex/lib/loanRules.ts`, client-safe constants):

```ts
export const MAX_LOAN_DAYS = 30;
export const MAX_ADVANCE_DAYS = 180;
export const MAX_PENDING_PER_BORROWER = 10;
export const MAX_LOAN_LIST = 100;      // newest loans per list
export const MAX_BOOKED_PERIODS = 50;
```

New error code: `AppErrorCode` gains **`"CONFLICT"`** + `conflict(message)` — for invalid transitions, overlaps, and removal blocked by an approved loan (the request is valid but the current state forbids it). Bad dates / caps stay `INVALID_ARGUMENT`.

## Status Machine

```
            request (borrower)
                 │
                 ▼
            ┌─────────┐  cancel (borrower)   ┌───────────┐
            │ pending │ ───────────────────▶ │ cancelled │
            └─────────┘                      └───────────┘
             │       │ reject (lender) / auto: period_taken, tool_removed
     approve │       └──────────────────────▶ ┌──────────┐
    (lender) ▼                                │ rejected │
            ┌──────────┐                      └──────────┘
            │ approved │
            └──────────┘
                 │ markReturned (lender)
                 ▼
            ┌──────────┐
            │ returned │      (rejected / cancelled / returned are final)
            └──────────┘
```

| From | To | Who | Preconditions | Writes |
|---|---|---|---|---|
| — | `pending` | any stored user except the owner | tool active; valid period (Decision 11); no approved overlap; no own open overlap on this tool; pending count < 10 | insert, `lenderId = tool.ownerId` |
| `pending` | `approved` | lender | tool active; no approved overlap (re-check) | `decidedAt`; overlapping pending of same tool → `rejected` + `period_taken` |
| `pending` | `rejected` | lender | — | `decidedAt` |
| `pending` | `rejected` | system (`approve` / `deactivateTool`) | — | `decidedAt`, `closeReason` |
| `pending` | `cancelled` | borrower | — | `cancelledAt` |
| `approved` | `returned` | lender | — | `returnedAt` |

Implementation (pure + testable):

```ts
// convex/lib/loans.ts
export const LOAN_TRANSITIONS: Record<LoanStatus, readonly LoanStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["returned"],
  rejected: [], cancelled: [], returned: [],
};
export function canTransition(from: LoanStatus, to: LoanStatus): boolean;

/** The ONLY place that changes loans.status. Throws CONFLICT on an invalid transition. */
export async function transitionLoan(
  ctx: MutationCtx, loan: Doc<"loans">, to: LoanStatus,
  extra?: { closeReason?: LoanCloseReason },
): Promise<void>;   // sets decidedAt / cancelledAt / returnedAt from Date.now()
```

Who-may-act checks live in the mutations (they know the caller); `transitionLoan` only knows the machine. Messages: "This request was already decided.", "Only approved loans can be marked as returned.", etc.

## Convex Functions

| Function | Type | Who can call | Args | Returns |
|---|---|---|---|---|
| `loans.request` | `mutation` | stored user, not the tool owner | `{ toolId, startDate, endDate }` | `Id<"loans">` |
| `loans.approve` | `mutation` | lender of the loan | `{ loanId }` | `null` |
| `loans.reject` | `mutation` | lender of the loan | `{ loanId }` | `null` |
| `loans.cancel` | `mutation` | borrower of the loan | `{ loanId }` | `null` |
| `loans.markReturned` | `mutation` | lender of the loan | `{ loanId }` | `null` |
| `loans.listMyRequests` | `query` | stored user | `{ today }` | `MyRequestItem[]` (caller is borrower), newest first, max 100 |
| `loans.listIncoming` | `query` | stored user | `{ today }` | `IncomingItem[]` (caller is lender), newest first, max 100 |
| `loans.bookedPeriods` | `query` | stored user | `{ toolId, today }` | `{ startDate, endDate }[]` — approved periods of an **active** tool with `endDate >= today`, sorted, max 50; **no user data** |
| `tools.listPublic` | `query` (changed) | anyone | `{ today? }` | unchanged shape; "available" now real |
| `tools.list` / `tools.listMine` | `query` (changed) | stored user | add `today?` (fallback: server UTC today) | unchanged shape |

Return shapes (each with a `returns` validator; never raw docs):

```ts
// shared loan fields
{ _id, _creationTime, startDate, endDate, status, decidedAt?, cancelledAt?, returnedAt?, closeReason?,
  isOverdue: boolean,                               // isOverdue(loan, today)
  tool: { _id, name, category, isActive } }         // tool read with ctx.db.get, deduplicated

// MyRequestItem  = shared + { lender: PublicUser }
// IncomingItem   = shared + { borrower: PublicUser }
```

Mutation order of checks: `requireUser` → load loan (`NOT_FOUND` "Loan not found.") → party check (`FORBIDDEN`; an unrelated user gets `FORBIDDEN`, not the loan's data) → state checks (`CONFLICT`) → write. `request`: `requireUser` → `parseIsoDate` / period rules (`INVALID_ARGUMENT`) → load tool (`NOT_FOUND` if missing or inactive) → own tool (`FORBIDDEN` "You can't borrow your own tool.") → pending cap → overlaps (`CONFLICT` "Those dates are already booked." / "You already have a request for these dates.") → insert.

`today` args are validated with `parseIsoDate` (`INVALID_ARGUMENT`). `transitionLoan` is used by `approve` / `reject` / `cancel` / `markReturned` and by the auto-rejects; `request` inserts directly (creation is the other event — see *Hooks for later specs*).

Helpers:

- `convex/lib/dates.ts` (pure): `parseIsoDate(s) → string` (throws `INVALID_ARGUMENT`), `addDays(iso, n)`, `daysBetweenInclusive(a, b)`, `utcToday(nowMs)`, `periodsOverlap(a, b)` (`a.start <= b.end && b.start <= a.end`).
- `convex/lib/loans.ts`: `LOAN_TRANSITIONS`, `canTransition`, `transitionLoan`, `validatePeriod(start, end, nowMs)`, `findApprovedOverlap(ctx, toolId, period, excludeLoanId?)`, `requireLoanParty(ctx, me, loanId, role: "lender" | "borrower")`, `isOverdue(loan, today)`, `listOverdue(ctx, today, limit)` (internal use only; consumed by the reminders spec), `toLoanItem(...)` projection.
- `convex/lib/tools.ts`: `getAvailability(ctx, tool, today)` → `on_loan` if `by_tool_status_start eq(tool._id).eq("approved").lte("startDate", today)` has a `.first()`, else `available`. `deactivateTool` per Decision 6.

## Authorization Matrix

| Function | Visitor | Borrower (of this loan) | Lender (of this loan / tool owner) | Unrelated user | Admin (not a party) |
|---|---|---|---|---|---|
| `request` | ❌ `UNAUTHENTICATED` | ✅ (on others' active tools) | ❌ `FORBIDDEN` on own tool | ✅ | ✅ same as user (❌ on own tool) |
| `approve` / `reject` | ❌ `UNAUTHENTICATED` | ❌ `FORBIDDEN` | ✅ if `pending` (else `CONFLICT`) | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` |
| `cancel` | ❌ `UNAUTHENTICATED` | ✅ if `pending` (else `CONFLICT`) | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` |
| `markReturned` | ❌ `UNAUTHENTICATED` | ❌ `FORBIDDEN` | ✅ if `approved` (else `CONFLICT`) | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` |
| `listMyRequests` | ❌ `UNAUTHENTICATED` | ✅ own requests only | ✅ own requests only (never incoming) | ✅ own only | ✅ own only ("all loans" = admin spec) |
| `listIncoming` | ❌ `UNAUTHENTICATED` | ✅ own incoming only | ✅ loans where `lenderId = me` | ✅ own only | ✅ own only |
| `bookedPeriods` | ❌ `UNAUTHENTICATED` | ✅ dates only | ✅ dates only | ✅ dates only | ✅ dates only |
| unknown `loanId` | ❌ `UNAUTHENTICATED` | ❌ `NOT_FOUND` | ❌ `NOT_FOUND` | ❌ `NOT_FOUND` | ❌ `NOT_FOUND` |

Admin gets no extra loan power in this spec (consistent with `tools.update` / `remove`). `borrowerId` / `lenderId` are never arguments — always `me._id` / `tool.ownerId`.

## Availability Rules

- `on_loan`: an `approved` loan of the tool with `startDate <= today` (not yet returned — `returned` changes the status, so it leaves the index range). Overdue loans stay `on_loan`.
- `available`: otherwise (pending requests and future approved loans don't change the badge).
- `getAvailability(ctx, tool, today)` is called once per tool by `listPublic` / `list` / `listMine` (≤ 200 / 100 parallel `.first()` lookups on one narrow index range each — no unbounded reads; each query's read set stays tool-scoped, so reactivity is precise). Upgrade path if it ever gets hot: one batch read of `approved` loans with `startDate <= today` into a `Set<toolId>` behind the same helper.
- `listPublic` keeps returning only `available` tools — a tool disappears from the public board while it is out and comes back on return (reactive).
- Callers pass `today`: client components via `useToday()`; `PublicToolListLoader` computes UTC `today` on the server (Decision 2).

## Routes and UI

| Route | Access | Content |
|---|---|---|
| `/tools` (changed) | `auth.protect()` | Non-own cards get a **"Request"** button → `RequestLoanDialog` |
| `/loans/requests` | `auth.protect()` | **My requests**: cards/rows grouped "Active" (pending, approved) then "Past" (rejected, cancelled, returned); tool name, lender name, period, status badge, overdue badge; **Cancel** on pending (confirm `AlertDialog`) |
| `/loans/incoming` | `auth.protect()` | **Incoming requests**: same grouping; borrower name; **Approve** / **Reject** on pending (reject confirms), **Mark returned** on approved (confirm) |

Header nav: "All tools", "My listings", "My requests", "Incoming" (active via `usePathname`; already scrolls horizontally on mobile).

`RequestLoanDialog`: tool name in the title; two native date inputs (`Input type="date"`, `min = today`, `max = today + 180`, end `min = start`); Zod `loanRequestSchema` mirrors the period rules (`loanRules.ts`) with field errors via `Field` / `FieldError`; under the inputs, "Already booked:" list from `bookedPeriods` (or "No bookings yet."); submit → "Request sent" toast, close. Server errors (e.g. overlap after a concurrent approval) → `toast.error(getErrorMessage(err))`, dialog stays open.

Display: `date-fns` `format(parseISO(d), "MMM d, yyyy")` (parse as local date — never `new Date("YYYY-MM-DD")`, which is UTC). Status labels/variants in `src/lib/loans.ts`: Pending (secondary), Approved (default), Rejected (destructive), Cancelled (outline), Returned (outline), + "Overdue" (destructive) when `isOverdue`; `closeReason` shown as small text ("Dates taken by another request", "Tool was removed"). Removed tool → name + "(removed)".

States:

| View | Loading | Empty | Error |
|---|---|---|---|
| My requests | skeleton list while user / query `undefined` | "You haven't requested any tools yet." + link to All tools | `(app)/error.tsx` |
| Incoming | skeleton | "No requests for your tools yet." | `(app)/error.tsx` |
| Request dialog booked list | small skeleton line | "No bookings yet." | toast |
| Action buttons | disabled + "Approving…" etc. while the mutation runs | — | `toast.error(getErrorMessage(err))` |

Success toasts: "Request sent", "Request approved", "Request rejected", "Request cancelled", "Marked as returned". Mobile: one column, actions wrap under the card content, no horizontal scroll, 16px gutters (existing layout).

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `convex/lib/validators.ts` | modify | `LOAN_STATUSES`, `loanStatusValidator`, `loanCloseReasonValidator` + types |
| `convex/lib/loanRules.ts` | create | Period limits and caps (client-safe constants) |
| `convex/lib/errors.ts` | modify | `CONFLICT` code + `conflict()` |
| `convex/lib/dates.ts` | create | Pure ISO-date helpers (Decision 1) |
| `convex/lib/loans.ts` | create | Transition table, `transitionLoan`, period/overlap/party helpers, `isOverdue`, `listOverdue`, projections |
| `convex/lib/tools.ts` | modify | `getAvailability(ctx, tool, today)` from loans; `deactivateTool` rules (Decision 6) |
| `convex/schema.ts` | modify | `loans` table + 5 indexes |
| `convex/loans.ts` | create | `request`, `approve`, `reject`, `cancel`, `markReturned`, `listMyRequests`, `listIncoming`, `bookedPeriods` (args + returns validators) |
| `convex/tools.ts` | modify | `today` arg on `listPublic` / `list` / `listMine`, passed to `getAvailability` |
| `convex/loans.test.ts` | create | convex-test (see *Testing*) |
| `convex/lib/dates.test.ts`, `convex/lib/loans.test.ts` | create | Pure helper tests (dates, transition table, `isOverdue`) |
| `convex/tools.test.ts` | modify | Pass `today`; availability/removal cases with loans |
| `src/hooks/useToday.ts` | create | Local `YYYY-MM-DD`, re-renders at local midnight |
| `src/lib/loans.ts` | create | Status labels/badge variants, close-reason labels, `formatLoanDate`, `loanRequestSchema` (Zod) |
| `src/types/loans.ts` | create | `MyRequestItem`, `IncomingItem` via `FunctionReturnType` |
| `src/components/tools/AllToolsView.tsx` | modify | `today` arg; "Request" action → dialog |
| `src/components/tools/MyListingsView.tsx` | modify | `today` arg; `RemoveToolDialog` copy mentions pending requests get rejected |
| `src/components/tools/PublicToolListLoader.tsx` | modify | UTC `today` for `preloadQuery` |
| `src/components/loans/RequestLoanDialog.tsx` | create | Date inputs, booked periods, `request` |
| `src/components/loans/LoanCard.tsx` | create | Presentational loan row (tool, counterpart, period, badges, actions slot) |
| `src/components/loans/LoanStatusBadge.tsx` | create | Status + overdue badges |
| `src/components/loans/MyRequestsView.tsx` | create | `'use client'`; `listMyRequests`, cancel |
| `src/components/loans/IncomingRequestsView.tsx` | create | `'use client'`; `listIncoming`, approve/reject/return |
| `src/components/loans/LoanActionDialog.tsx` | create | Generic `AlertDialog` confirm for reject/cancel/return |
| `src/components/loans/LoanListSkeleton.tsx` | create | Skeleton |
| `src/app/(app)/loans/requests/page.tsx` | create | `await auth.protect()` → `<MyRequestsView />` |
| `src/app/(app)/loans/incoming/page.tsx` | create | `await auth.protect()` → `<IncomingRequestsView />` |
| `src/components/layout/AppHeader.tsx` | modify | Two nav links |
| `context/project-overview.md` | modify | Data model draft: final `loans` shape, `cancelled`, ISO dates |

No new npm package; no new shadcn component.

```ts
// convex/loans.ts (shape)
export const approve = mutation({
  args: { loanId: v.id("loans") },
  returns: v.null(),
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await requireLoanParty(ctx, me, loanId, "lender");
    const tool = await ctx.db.get(loan.toolId);
    if (tool === null || !tool.isActive) conflict("This tool was removed.");
    if (await findApprovedOverlap(ctx, loan.toolId, loan, loan._id)) conflict("Those dates are already booked.");
    await transitionLoan(ctx, loan, "approved");
    await rejectOverlappingPending(ctx, loan);      // closeReason: "period_taken"
    return null;
  },
});
```

## Manual Steps (User)

### Before implementation

None — no env vars, no Clerk/Convex dashboard change. Keep `npx convex dev` and `npm run dev` running. Have at least one tool listed by account **A**.

### After implementation — browser checks (DEV, two accounts, translation off)

Account **A** (normal window, owner of a "Drill") and **B** (private window).

1. As **A** on **All tools**: your own Drill has no "Request" button.
2. As **B**: Request the Drill for tomorrow → day after. Try end before start, a start in the past, > 30 days → field errors, nothing sent. Submit valid → "Request sent"; **My requests** shows it as Pending.
3. As **A**: **Incoming** shows B's request live (no reload) with B's name. Approve → status Approved in both windows.
4. As **B**: request the same Drill for overlapping dates → "Those dates are already booked."; the dialog lists the booked period.
5. As **B**: request non-overlapping dates, then **Cancel** it → Cancelled.
6. Request starting **today** and approve it → Drill badge becomes **On loan** on All tools / My listings, and it disappears from the signed-out `/` list. As **A** try to remove the Drill → blocked with a message. **Mark returned** → Available again, back on `/`.
7. As **B** create a pending request, then as **A** remove the tool → B's request shows Rejected · "Tool was removed".
8. Mobile width (~375px): both loan pages, header nav, dialog with native date pickers usable; no horizontal scroll.
9. Optional (dashboard → dev → *Functions* → `loans:approve`, *Act as a user* B, A's loan id) → `FORBIDDEN`.

## Implementation Steps (Claude)

All against **DEV**. Re-check Convex/shadcn APIs with Context7 while implementing.

1. Branch `feature/loans` from `main`.
2. `validators.ts`, `loanRules.ts`, `errors.ts` (`CONFLICT`), `dates.ts` + `dates.test.ts`.
3. `schema.ts` (`loans` + indexes); let the running `npx convex dev` push it and check its output.
4. `convex/lib/loans.ts` + `loans.test.ts` (pure parts); update `convex/lib/tools.ts` (`getAvailability`, `deactivateTool`).
5. `convex/loans.ts`; `today` arg in `convex/tools.ts`.
6. `convex/loans.test.ts`, update `convex/tools.test.ts`; `npm run test:run`.
7. Client: `useToday`, `src/lib/loans.ts`, `src/types/loans.ts`, update tools views + `PublicToolListLoader`.
8. `src/components/loans/*`, the two pages, `AppHeader` links.
9. `context/project-overview.md` data model.
10. `npm run lint`, `npm run test:run`, `npm run build`; browser check with Playwright where possible, then guide the user through *Manual Steps*.
11. Run **auth-auditor** on `convex/loans.ts`, `convex/lib/loans.ts`, `convex/lib/tools.ts`.
12. Ask before committing; go through *PROD Impact* before merging.

## Hooks for Later Specs

- **Automation event point** (n8n Workflow 1): every status change goes through `transitionLoan`; creation happens only in `loans.request`. The automation spec adds, at those two call sites only, `await ctx.scheduler.runAfter(0, internal.automation.notifyLoanEvent, { loanId, event })` (`event`: `"created"` or the new status, incl. auto-rejects with `closeReason`). Scheduling inside the mutation is transactional (no event if the mutation fails). **Not implemented here** — no scheduler call, no action, no table.
- **Overdue** (Workflow 2): `isOverdue(loan, today) = status === "approved" && endDate < today`; `listOverdue(ctx, today, limit)` uses `by_status_end`. The reminders spec decides the source of `today` (n8n schedule timezone vs server UTC) and exposes it through a signed HTTP action.
- **Admin "view all loans"**: reuse `toLoanItem` with both parties as `publicUser`; read via `by_status_end` / `_creationTime` with `.take` or pagination. Admin tool removal calls `deactivateTool` (Decision 6 applies; the admin spec decides about forcing it).
- **Automation activity on loans** (bonus F): `automationLogs.loanId` will reference `loans._id`.

## PROD Impact

Merging to `main` runs `npx convex deploy` on Convex prod:

- **Schema:** new `loans` table + 5 indexes — additive; `users` / `tools` unchanged → no migration.
- **Functions:** new `loans:*`. `tools.listPublic` / `list` / `listMine` gain **`today: v.optional(v.string())`**, falling back to server UTC today when absent (decided). Convex functions deploy before the new Next.js build goes live; with an optional arg the **old** PROD frontend keeps working during that window (a required arg would fail validation). Tests cover both with and without `today`.
- No env vars, no Clerk change. PROD loans start empty.

Check before merging:

- [ ] `npm run build` / `lint` / `test:run` pass
- [ ] DEV verified with two accounts (*Manual Steps*)
- [ ] auth-auditor: no critical/high findings
- [ ] `today` is optional on `tools.*` queries (old frontend compatible)
- [ ] User confirms the merge (push to `main` = PROD deploy)
- [ ] After deploy: `/` loads signed out; a request → approve → return round trip works on PROD (done by the user, or by Claude only with explicit permission)

Rollback: Vercel Instant Rollback doesn't revert Convex; revert the commit on `main`, **keeping the `loans` table definition** if PROD already has loan rows (otherwise the schema push fails validation).

## Acceptance Criteria

- [ ] `loans` table with the fields and 5 indexes above, pushed to DEV without errors
- [ ] Status machine in one table + `transitionLoan`; every invalid transition → `CONFLICT`; final states are final
- [ ] `request` rejects: signed out, own tool, inactive/unknown tool, bad/past/too-long/too-far dates, approved overlap, own open overlap, > 10 pending
- [ ] `approve` / `reject` / `markReturned` only by the lender; `cancel` only by the borrower; unrelated users and admins get `FORBIDDEN`
- [ ] `approve` re-checks overlap and auto-rejects overlapping pending requests (`period_taken`)
- [ ] Concurrent overlapping approves cannot both succeed (relies on Convex OCC; covered by sequential test of the re-check)
- [ ] `listMyRequests` / `listIncoming` return only the caller's loans, counterpart as `{ _id, name }` only, tool name even if removed
- [ ] `bookedPeriods` returns dates only, no user ids
- [ ] Availability: approved loan starting ≤ today → `on_loan` everywhere; returned → `available`; public board hides on-loan tools
- [ ] Removing a tool: blocked with an approved loan; pending requests auto-rejected (`tool_removed`)
- [ ] `isOverdue` / `listOverdue` exist and are tested; no HTTP endpoint, no scheduler call
- [ ] `/loans/requests`, `/loans/incoming` start with `await auth.protect()`; Request dialog on `/tools`; loading/empty/error states; toasts; mobile width OK
- [ ] No `.filter` on DB queries; all lists bounded; no `Date.now()` in queries
- [ ] No new npm dependency; `npm run lint`, `npm run test:run`, `npm run build` pass
- [ ] No `--prod` command run; no secrets in tracked files

## Testing

### Unit (convex-test) — `convex/loans.test.ts`

Setup as in `convex/tools.test.ts` (Alice owns tools, Bob borrows, Carol admin, `errorCode()` helper). Use fixed dates relative to a mocked clock: `vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T12:00:00Z"))` so `utcToday` is deterministic; pass `today: "2026-11-12"` to queries.

- **request**: signed out → `UNAUTHENTICATED`; own tool → `FORBIDDEN`; removed tool / unknown id → `NOT_FOUND`; `endDate < startDate`, malformed (`"2026-2-3"`, `"2026-02-30"`), start before `utcToday − 1`, 31 days, start > 180 days ahead → `INVALID_ARGUMENT`; single-day and 30-day loans → ok; row has `lenderId = tool.ownerId`, `borrowerId = me`, `status: "pending"`; extra `borrowerId` / `lenderId` / `status` args (cast) → validator rejects
- **overlap**: approved Nov 14–16 blocks requests 16–18, 10–14, 15–15, 10–20 (`CONFLICT`); 17–18 and 10–13 ok; **pending** loans of another borrower don't block; same borrower's open overlapping request → `CONFLICT`; 11th pending → `INVALID_ARGUMENT`
- **approve**: lender → approved + `decidedAt`; borrower / unrelated / admin → `FORBIDDEN`; already approved / rejected / cancelled → `CONFLICT`; overlapping approved exists (created via `t.run`) → `CONFLICT`; overlapping pending of others → `rejected` + `period_taken`, non-overlapping pending untouched; tool removed meanwhile → `CONFLICT`
- **reject**: lender only; non-pending → `CONFLICT`
- **cancel**: borrower only (lender / unrelated → `FORBIDDEN`); approved → `CONFLICT`
- **markReturned**: lender → returned + `returnedAt`; borrower → `FORBIDDEN`; pending / returned → `CONFLICT`
- **unknown loan id** → `NOT_FOUND` for every mutation
- **listMyRequests / listIncoming**: signed out → `UNAUTHENTICATED`; Bob sees only his requests, Alice only loans on her tools, Carol (unrelated admin) sees none of theirs; counterpart keys exactly `["_id", "name"]`; tool name present after the tool is removed; `isOverdue` true for approved with `endDate < today`
- **bookedPeriods**: returns only approved periods with `endDate >= today`; items keys exactly `["endDate", "startDate"]`
- **availability** (via `tools.list` / `listPublic`): available → (approve loan starting today) on_loan and hidden from `listPublic` → (markReturned) available; future approved loan → still available; overdue approved → on_loan
- **deactivate**: `tools.remove` with approved loan → `CONFLICT`, still active; with pending loans → removed, pending → `rejected` + `tool_removed`
- **API surface**: `api.loans` exposes exactly the 8 functions

### Pure — `convex/lib/dates.test.ts`, `convex/lib/loans.test.ts`

`parseIsoDate` (valid, malformed, impossible dates, leap day 2028-02-29), `addDays` across month/year ends, `daysBetweenInclusive`, `periodsOverlap` boundary cases (touching days overlap), `utcToday`; full `LOAN_TRANSITIONS` matrix (every from × to pair), `isOverdue` boundaries (`endDate === today` → not overdue).

### Manual (browser, DEV)

See *Manual Steps (User)*.

## Out of Scope

- **Admin**: view all loans, remove any listing, Trusted Lender (admin spec)
- **n8n / automation**: webhooks, HTTP endpoints, the scheduler call, reminders, `automationLogs`, automation activity UI (automation specs)
- Notifications of any kind (email, in-app, badges/counters), messaging between users, ratings
- Borrower cancelling an **approved** loan; editing a request's dates (cancel and re-request)
- Calendar/range-picker UI with disabled days; pagination of loan lists; tool detail page
- Any PROD action beyond the automatic deploy on merge

## Doc Conflicts

| Topic | Conflict | Followed |
|---|---|---|
| Loan statuses | Overview draft: `pending \| approved \| rejected \| returned` | Adds `cancelled` (Decision 4) and `closeReason`; update the draft. |
| Dates | Draft doesn't fix a type; Convex examples use epoch ms (`Date.now()`) | ISO `YYYY-MM-DD` for whole-day periods; epoch ms only for event timestamps (Decision 1). |
| Time in queries | Using "today" in a query conflicts with Convex best practice (no `Date.now()` in queries) | `today` is a query argument from the client (Decision 2). |
| Date picker | Brief asks for a date range picker; shadcn base-nova `calendar` needs `react-day-picker` (not installed) | Native date inputs; calendar is an upgrade path (Decision 8). |
| Draft data model | `returnedAt?` only | Adds `decidedAt?`, `cancelledAt?`; request time = `_creationTime`. |
| `tools.*` args | tools-public-page queries take no `today` | Adds optional `today` with server UTC fallback (see *PROD Impact*). |

## References

- Convex — Optimistic concurrency control, serializability: https://docs.convex.dev/database/advanced/occ
- Convex — How Convex works (read set records scanned **index ranges**; commit-time overlap check; retries): https://stack.convex.dev/how-convex-works
- Convex — Write conflicts / OCC remediation (read only what you need, selective index ranges): https://docs.convex.dev/error
- Convex — Best practices (no `Date.now()` in queries, index vs filter, redundant indexes, helper functions): https://docs.convex.dev/understanding/best-practices
- Convex — Runtimes (`Date.now()` frozen per function execution; determinism): https://docs.convex.dev/functions/runtimes
- Convex — Query functions (caching / reactivity / determinism): https://docs.convex.dev/functions/query-functions
- Convex — Relationship structures (store parent id on child + index; denormalized copies must be kept in sync): https://stack.convex.dev/relationship-structures-let-s-talk-about-schemas
- Convex — Indexes (compound indexes, range expressions in field order): https://docs.convex.dev/database/reading-data/indexes
- Convex — Scheduled functions (`ctx.scheduler.runAfter` from mutations is transactional): https://docs.convex.dev/scheduling/scheduled-functions
- Convex — Application errors: https://docs.convex.dev/functions/error-handling/application-errors
- Convex — convex-test: https://docs.convex.dev/testing/convex-test
- shadcn/ui — Base date picker (Popover + Calendar composition, range picker): https://ui.shadcn.com/docs/components/base/date-picker
- shadcn/ui — Base calendar (`mode="range"`, `timeZone` prop, React DayPicker): https://ui.shadcn.com/docs/components/base/calendar
- shadcn/ui — base-nova calendar registry item (`dependencies: ["cn", "react-day-picker@latest", "date-fns"]`): https://ui.shadcn.com/r/styles/base-nova/calendar.json
- MDN — `<input type="date">` (value always `yyyy-mm-dd`, `min`/`max`): https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date
- date-fns — `parseISO` / `format`: https://date-fns.org/docs/parseISO
- Project: `CLAUDE.md`, `context/project-overview.md`, `context/coding-standards.md`, `context/ai-interaction.md`, `context/current-feature.md`, `context/features/schema-rbac.md`, `context/features/tools-public-page.md`; code in `convex/` and `src/` (read 2026-11-12)

Not fetched in this session (cited from prior knowledge; re-check during implementation): Convex scheduled functions, MDN `<input type="date">`, date-fns `parseISO`, Convex indexes / application errors / convex-test (those three were read for tools-public-page).

Source conflicts: the Convex OCC docs page describes the read set per record; the stack.convex.dev "How Convex works" article states index ranges are recorded. Followed the latter (more specific, and consistent with the docs' serializability guarantee) for Decision 10.
