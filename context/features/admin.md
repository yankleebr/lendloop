# Admin — Moderation, All Loans and Trusted Lender (DEV)

## Overview

An admin can moderate the board and see all loan activity:

- **Remove any listing** through a new `requireAdmin` mutation that reuses `deactivateTool` (same loan rules as the owner; pending requests auto-rejected with `tool_removed`)
- **View all loans**, paginated, filterable by status or "overdue", with tool name, borrower and lender as `publicUser`, dates, status and overdue flag
- **Trusted Lender**: an admin-only, idempotent mutation to set/unset `users.isTrustedLender`, a paginated admin users list to pick from, and a **"Trusted Lender" badge** wherever a lender is shown
- **Admin UI** under `/admin` (Listings, Loans, Users), nav link visible to admins only, friendly "Admins only" state for everyone else
- convex-test coverage for every admin function and for the changed projections

Every rule is enforced **inside Convex** with `requireAdmin`; the UI only hides what the caller can't use. Targets the **DEV environment**; schema and functions reach Convex **prod** on the next `main` push (see *PROD Impact*).

## Prerequisites

Already done (see `context/current-feature.md` → *History*):

- `users` (`tokenIdentifier`, `name`, `email?`, `role`, `isTrustedLender: v.boolean()` — always `false` today); `users.store` never writes `role` / `isTrustedLender`; `users.setRole` is an `internalMutation` (dashboard / CLI only); `users.current` returns the caller's own `role` and `isTrustedLender`
- `convex/lib/auth.ts`: `getCurrentUser`, `requireUser`, `requireAdmin` (`UNAUTHENTICATED` / `FORBIDDEN`); `convex/lib/errors.ts` codes `UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND` / `INVALID_ARGUMENT` / `CONFLICT`
- `publicUser` / `publicUserValidator` (`{ _id, name }`) in `convex/lib/users.ts` — never raw `users` docs; email is display-only and never returned about other users
- `tools` with soft delete (`isActive`), indexes `by_active_category`, `by_owner_active`; `tools.list` (board, `.take(200)`, owner as `publicUser`, `availability`); `tools.remove` is owner-only and calls `deactivateTool`
- `deactivateTool(ctx, tool)` → `closeLoansForRemovedTool`: **`CONFLICT` while the tool has any `approved` loan**, otherwise every `pending` loan → `rejected` + `closeReason: "tool_removed"` in batches, then `isActive: false`
- `loans` with `transitionLoan` as the only writer of `status`; indexes `by_tool_status_start`, `by_borrower`, `by_borrower_status`, `by_lender`, `by_status_end`; `isOverdue(loan, today)`, `listOverdue`; `loadLoanRefs` (dedup tool/user reads), `toLoanItem`, `loanItemFields`; lists `.take(MAX_LOAN_LIST = 100)`; `today` is a client argument (`useToday()`)
- UI: `(app)` group with `AppHeader` (nav links, horizontal scroll on mobile), `<Suspense>` in the layout, `error.tsx` (`getErrorMessage`); every `page.tsx` starts with `await auth.protect()`; client queries pass `"skip"` until `useCurrentUser().user` exists; `ToolCard`, `LoanCard` (+ `actions` slot), `LoanStatusBadge`, `LoanActionDialog`, `CategoryFilter`, skeletons
- shadcn installed: `alert-dialog`, `badge`, `button`, `card`, `dialog`, `field`, `input`, `label`, `select`, `separator`, `skeleton`, `sonner`, `textarea`. **Not installed:** `tabs`, `table`, `switch`
- Versions: `convex` ^1.49, `convex-test` ^0.0.69, `next` 16.4.6, `@clerk/nextjs` ^7.9, `@base-ui/react` ^1.9
- A DEV admin and a PROD admin already exist (promoted via `users:setRole`)

## Requirements

- `admin.removeTool` — admin removes any active listing via `deactivateTool`; records who removed it
- `admin.listLoans` — paginated, all loans, filter `all | <status> | overdue`, both parties as `publicUser`, `isOverdue`
- `admin.listUsers` — paginated, minimal admin projection (no email, no `tokenIdentifier`)
- `admin.setTrustedLender` — admin-only, idempotent set/unset
- `publicUser` gains `isTrustedLender`; badge on the tools board and loan views where a lender appears
- `/admin/listings`, `/admin/loans`, `/admin/users` pages with `auth.protect()`, an admin gate, admin-only nav link, confirm dialogs, toasts, loading/empty/error states, 375px
- Roles are **not** editable from the UI; `users.setRole` stays internal
- convex-test coverage (see *Testing*)

## Decisions

| # | Topic | Options considered | Decision and why |
|---|---|---|---|
| 1 | **Admin removal during an approved loan** | (a) Same rule as the owner: `CONFLICT` while any `approved` loan exists; (b) admin "force": remove anyway and close the approved loan (needs a new `approved → cancelled` transition or a fake `returned`); (c) force-remove but leave the approved loan open on a hidden tool | **(a) — admins follow the same loan rules.** An approved loan means the tool is physically out (or promised). The only exit from `approved` is `returned`, and only the lender can confirm it (loans Decision 5) — an admin marking it returned would be a lie that silences overdue reminders. (b) adds a new transition, a new notification case for the automation spec and a new `closeReason`, all for a rare moderation case. (c) leaves an approved loan pointing at a tool nobody can see, which the loans spec explicitly avoided (loans Decision 6). With (a) the admin sees the same message ("Mark the loan as returned (or close it) before removing this tool."), the board keeps showing the tool as **On loan**, and the admin removes it once the lender closes the loan. Known limitation: a future approved loan also blocks removal — the lender can close it with *Mark returned*; documented, not solved here. No change to `deactivateTool`'s loan rules. |
| 2 | **Moderation audit fields** | (a) Nothing (only `isActive: false`); (b) optional `removedAt` + `removedBy` on `tools`, written by `deactivateTool` for owner **and** admin removals; (c) `removedBy` + free-text moderation reason; (d) separate `moderationLog` table | **(b).** Without it nothing distinguishes "the owner removed it" from "an admin removed it" — the automation spec needs that to word the notification to the owner ("removed by a moderator") and to the borrowers of auto-rejected requests, and it is the minimum trail for an admin power. Both fields are `v.optional` → existing DEV/PROD docs stay valid, no migration. (c) a reason needs an input, length rules, display surface and is user-generated content (possible PII) with no consumer yet. (d) is a new table + list for a single event type. `deactivateTool(ctx, tool, removedBy)` gains the caller's id; `tools.remove` passes `me._id`, `admin.removeTool` passes `admin._id`. Loans keep `closeReason: "tool_removed"` (reused — the borrower's outcome is the same; *who* removed it is on the tool). Plus one `console.log` line like `users.setRole` for the Convex logs. Not displayed in the UI in this spec. |
| 3 | **Pagination vs bounded lists** | (a) `.take(N)` like the user lists; (b) `paginate(paginationOpts)` + `usePaginatedQuery` with "Load more" | **(b) for `listLoans` and `listUsers`; the Listings tab reuses `tools.list` (already `.take(200)`, the whole active board).** "All loans" grows forever across every user — a fixed `.take(100)` would silently hide history, which is exactly what an admin view must show. Convex pagination is cursor-based, reactive and supported by `usePaginatedQuery` (statuses `LoadingFirstPage` / `CanLoadMore` / `LoadingMore` / `Exhausted`, `"skip"` supported). Each filter is an **index range** (Decision 3b), never `.filter`, so a page reads only its rows (Convex: a data-dependent `.filter` can scan thousands of rows per page). Joins: one paginated query per function (Convex/convex-test allow a single `.paginate()`), then `loadLoanRefs` on the page only — at most 2×page-size + page-size deduplicated parallel `ctx.db.get`s, no N+1 across pages. Page size 20 from the client, clamped server-side to `ADMIN_PAGE_MAX = 50` (an admin-only function, but `numItems` is client-controlled). Return validator: `paginationResultValidator(item)` from `convex/server`. |
| 3b | **Indexes for "all loans"** | (a) Reuse `by_status_end` for status filters (sorted by end date); (b) add `by_status` `["status"]` (implicitly `_creationTime`) for newest-first per status | **(b) add `by_status`.** All-loans default order is newest request first (`_creationTime` desc, the built-in `by_creation_time` index, no filter). For a status filter, `by_status_end` would sort by `endDate`, not by request time — mixing orders between filters is confusing. Convex calls `by_foo` + `by_foo_and_bar` redundant **unless a different sort order is needed**, which is the case here. Overdue keeps `by_status_end`: `eq("approved").lt("endDate", today)`, ascending = most overdue first (same range as `listOverdue`). Table: all → `by_creation_time` desc; `<status>` → `by_status eq(status)` desc; `overdue` → `by_status_end eq("approved").lt(endDate, today)` asc. Changing the filter changes the query → `usePaginatedQuery` restarts from page one (documented cursor behavior). |
| 4 | **User list fields and PII** | (a) `name`, `role`, `isTrustedLender`, joined (`_creationTime`), `isMe`; (b) + email; (c) + counts (active listings, loans lent/returned) | **(a).** Admin needs enough to pick a lender and to tell two "Neighbor"s apart: name + joined date + role + trusted. Email is display-only / minimal PII (schema-rbac carry-over): showing every user's email to every admin widens exposure with no action that needs it; the operator can still see it in the Convex dashboard. (c) needs per-row counting queries (`by_lender` / `by_owner_active` per user — unbounded reads per row, no denormalized counters yet); the admin can check a lender's history in the Loans tab. Never `tokenIdentifier`. Order: newest users first (`by_creation_time` desc), paginated (Decision 3). No search (out of scope; a search index on `name` is the upgrade path). |
| 5 | **`isTrustedLender` in `publicUser`** | (a) Add `isTrustedLender` to `publicUser` (one projection, every place gets it); (b) a separate `publicLender` projection only where the user acts as lender; (c) a separate query per lender | **(a).** The flag is public by design (it is a badge). One projection keeps one rule: "other users see `_id`, `name`, `isTrustedLender` — nothing else". Call sites (all checked): `tools.list` (`owner` → badge on the board), `loans.listMyRequests` (`lender` → badge), `loans.listIncoming` (`borrower` → returned but **not rendered**: the badge is about lending), `loadLoanRefs` (shared), new `admin.listLoans` (`lender` badge). `tools.listPublic` returns no owner and stays unchanged (visitors see no owner details). (b) duplicates the projection for one boolean; (c) is N extra queries. Additive return-shape change → the old PROD frontend ignores the field during deploy. Existing tests asserting keys `["_id", "name"]` are updated to `["_id", "isTrustedLender", "name"]`. |
| 6 | **Non-admin on `/admin/*`** | (a) Only Convex: the query throws `FORBIDDEN` → `(app)/error.tsx`; (b) client gate: `AdminGate` reads `useCurrentUser()` and renders an "Admins only" state, admin queries `"skip"` until `role === "admin"`; (c) server-side role check in each page (`fetchQuery(api.users.current, {}, { token })` with Clerk `getToken()`) + Next.js `forbidden()` | **(b), with (a) as the backstop.** Authorization stays in Convex (`requireAdmin` in every admin function), so the page check is UX only. (a) alone shows a generic error page with a "Try again" button that can never succeed. (c) adds a non-reactive Convex HTTP round trip per navigation (`fetchQuery` is non-reactive, server rendering is beta, and a stateless client may see a different snapshot than the reactive client), and `forbidden()` needs the **experimental** `authInterrupts` flag — real cost for a check that protects nothing Convex doesn't already protect. (b) is reactive: if a role changes while the page is open, `users.current` updates and the gate flips. Gate lives in `src/app/(app)/admin/layout.tsx` (a client component inside a layout is fine — it is not the `auth.protect()` rule, which stays in each `page.tsx`). In the rare race where an admin query re-runs before `users.current` updates after a demotion, the query's `FORBIDDEN` reaches `error.tsx` with "Only admins can do this." — accepted. |
| 7 | **Custom function wrappers vs helper** | (a) Keep `requireAdmin(ctx)` as the first line; (b) `convex-helpers` `customQuery` / `customMutation` (`adminQuery`) | **(a).** Convex best practices recommend plain helper functions for shared authorization (thin wrappers around helpers). (b) needs a new dependency (`convex-helpers`) and a second style next to the existing `requireUser` pattern for 4 functions. Revisit if admin functions multiply. |
| 8 | **Trusted mutation shape** | (a) `toggleTrusted({ userId })`; (b) `setTrustedLender({ userId, isTrusted })` | **(b) — explicit target value, idempotent.** A toggle sent twice (double click, retry) undoes itself; setting a value converges. Patch only when the value changes. Admins may mark themselves (the admin role already implies trust; a self-rule adds nothing). Role is never an argument and never written. |
| 9 | **Admin UI structure** | (a) One `/admin` page with shadcn `Tabs` (needs `npx shadcn add tabs`); (b) sub-routes `/admin/listings`, `/admin/loans`, `/admin/users` with a small link sub-nav; tables vs cards | **(b) sub-routes + cards.** Each view gets a URL (shareable, back button works), each `page.tsx` runs `auth.protect()` per the project rule, and only the visible view subscribes to its query. The sub-nav reuses the `AppHeader` link style (no new component install). Cards (`ToolCard`, `LoanCard`) instead of `Table`: `Table` would need `npx shadcn add table` and horizontal scrolling at 375px; the cards already work at mobile width. Trusted toggle is a `Button`, not `Switch` (not installed; an explicit action with a toast is clearer). **No new shadcn component, no new npm package.** |

## Data Model

```ts
// convex/schema.ts (changes only)
tools: defineTable({
  // ...existing fields
  isActive: v.boolean(),
  // set together by deactivateTool (owner or admin removal); absent on active tools
  // and on tools removed before this spec
  removedAt: v.optional(v.number()),        // epoch ms
  removedBy: v.optional(v.id("users")),
})
  .index("by_active_category", ["isActive", "category"])
  .index("by_owner_active", ["ownerId", "isActive"]),

loans: defineTable({ /* unchanged */ })
  // ...existing 5 indexes
  .index("by_status", ["status"]),          // admin: newest first per status (implicit _creationTime)
```

```ts
// convex/lib/users.ts
export const publicUserValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  isTrustedLender: v.boolean(),
});
export function publicUser(user: Doc<"users">): PublicUser {
  return { _id: user._id, name: user.name, isTrustedLender: user.isTrustedLender };
}
// fallbacks for missing users ({ _id, name: "Neighbor" }) in tools.ts / lib/loans.ts gain isTrustedLender: false
```

```ts
// convex/lib/adminRules.ts (client-safe constants)
export const ADMIN_PAGE_SIZE = 20;   // initialNumItems / loadMore
export const ADMIN_PAGE_MAX = 50;    // server clamp for paginationOpts.numItems
export const ADMIN_LOAN_FILTERS = ["all", ...LOAN_STATUSES, "overdue"] as const;
// convex/lib/validators.ts: adminLoanFilterValidator = v.union(...ADMIN_LOAN_FILTERS.map(v.literal))
```

Schema-evolution safety (Convex: adding an `optional` field and adding a table/index are safe pushes): `removedAt` / `removedBy` are optional → existing documents are valid; `by_status` is backfilled on push (the `loans` table is small in DEV and PROD). No `.staged()` validator and no migration needed. `users` unchanged (`isTrustedLender` already exists and is `false` everywhere).

## Convex Functions

New file `convex/admin.ts` — every handler starts with `const admin = await requireAdmin(ctx);`.

| Function | Type | Who can call | Args | Returns |
|---|---|---|---|---|
| `admin.removeTool` | `mutation` | admin | `{ toolId: v.id("tools") }` | `null` — `NOT_FOUND` if missing/already removed; `CONFLICT` with an approved loan (Decision 1) |
| `admin.listLoans` | `query` | admin | `{ filter: adminLoanFilterValidator, today: v.string(), paginationOpts: paginationOptsValidator }` | `paginationResultValidator(AdminLoanItem)` |
| `admin.listUsers` | `query` | admin | `{ paginationOpts: paginationOptsValidator }` | `paginationResultValidator(AdminUserItem)` |
| `admin.setTrustedLender` | `mutation` | admin | `{ userId: v.id("users"), isTrusted: v.boolean() }` | `null` — `NOT_FOUND` for unknown user; no-op when unchanged |
| `tools.remove` | `mutation` (changed) | owner | unchanged | unchanged; passes `me._id` as `removedBy` |
| `tools.list`, `loans.listMyRequests`, `loans.listIncoming` | `query` (changed) | stored user | unchanged | `owner` / `lender` / `borrower` gain `isTrustedLender` |

```ts
// AdminLoanItem
{ ...loanItemFields, borrower: publicUserValidator, lender: publicUserValidator }

// AdminUserItem — never email, never tokenIdentifier
{ _id: v.id("users"), _creationTime: v.number(), name: v.string(),
  role: roleValidator, isTrustedLender: v.boolean(), isMe: v.boolean() }
```

```ts
// convex/admin.ts (shape)
export const listLoans = query({
  args: { filter: adminLoanFilterValidator, today: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ ...loanItemFields, borrower: publicUserValidator, lender: publicUserValidator })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const today = parseIsoDate(args.today, "Today");
    const opts = { ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, ADMIN_PAGE_MAX) };
    const result = await adminLoansQuery(ctx, args.filter, today).paginate(opts); // index per Decision 3b
    const { tools, users } = await loadLoanRefs(ctx, result.page);
    return {
      ...result,
      page: result.page.map((loan) => ({
        ...toLoanItem(loan, tools.get(loan.toolId)!, today),
        borrower: users.get(loan.borrowerId)!,
        lender: users.get(loan.lenderId)!,
      })),
    };
  },
});

export const removeTool = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    const admin = await requireAdmin(ctx);
    const tool = await ctx.db.get(toolId);
    if (tool === null || !tool.isActive) notFound("Tool not found.");
    await deactivateTool(ctx, tool, admin._id);
    console.log(`admin.removeTool: ${toolId} by ${admin._id}`);
    return null;
  },
});
```

`adminLoansQuery(ctx, filter, today)` is a small helper in `convex/lib/admin.ts` returning the ordered query (no `.filter`). `deactivateTool(ctx, tool, removedBy: Id<"users">)` patches `{ isActive: false, removedAt: Date.now(), removedBy }` after `closeLoansForRemovedTool`.

Order of checks: `requireAdmin` (`UNAUTHENTICATED` / `FORBIDDEN`, before any read) → arg validation (`parseIsoDate`) → load (`NOT_FOUND`) → state (`CONFLICT`) → write.

## Authorization Matrix

| Function | Visitor | user | user — owner of the tool / party of the loan | admin |
|---|---|---|---|---|
| `admin.removeTool` | ❌ `UNAUTHENTICATED` | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` (owners use `tools.remove`) | ✅ any active tool (❌ `CONFLICT` with an approved loan) |
| `admin.listLoans` | ❌ `UNAUTHENTICATED` | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` | ✅ all loans, parties as `publicUser` |
| `admin.listUsers` | ❌ `UNAUTHENTICATED` | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` | ✅ admin projection (no email) |
| `admin.setTrustedLender` | ❌ `UNAUTHENTICATED` | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` (cannot trust self) | ✅ any user, idempotent |
| `tools.remove` (changed) | ❌ `UNAUTHENTICATED` | ❌ `FORBIDDEN` | ✅ own tool | ❌ `FORBIDDEN` on others' tools (unchanged; admin uses `admin.removeTool`) |
| `tools.update` | unchanged | unchanged | ✅ own | ❌ `FORBIDDEN` on others' tools (editing others' listings is out of scope) |
| `loans.*` | unchanged | unchanged | unchanged | **same as a normal user**: may request others' tools, approve/reject/return only as lender, cancel only as borrower; `listMyRequests` / `listIncoming` show only own loans |
| `users.setRole` | internal | internal | internal | internal (dashboard only — never from the UI) |

`role`, `isTrustedLender`, `removedBy` are never taken from the client except `isTrusted` as the *target value* of an admin-authorized mutation; the acting admin is always `requireAdmin(ctx)`.

## Routes and UI

| Route | Access | Content |
|---|---|---|
| `/admin` | `auth.protect()` | `redirect("/admin/loans")` |
| `/admin/loans` | `auth.protect()` + gate | **All loans**: status filter (`Select`: All, Pending, Approved, Rejected, Cancelled, Returned, Overdue); `LoanCard` list with tool, "Alice → Bob" (lender → borrower, Trusted badge on lender), period, status / overdue badges, close reason, requested date; "Load more" button (`status === "CanLoadMore"`), "Loading…" while `LoadingMore` |
| `/admin/listings` | `auth.protect()` + gate | **Listings**: `tools.list` with `CategoryFilter`; `ToolCard` with owner + Trusted badge + availability; **Remove** button → confirm `AlertDialog` ("Remove “Drill” by Alice? Pending requests will be rejected. This can't be undone.") → `admin.removeTool`; `CONFLICT` shown as toast |
| `/admin/users` | `auth.protect()` + gate | **Users**: cards/rows with name, "(you)", role badge (Admin), Trusted badge, joined date; **Mark trusted** (no confirm) / **Remove trusted** (confirm `AlertDialog`); "Load more" |

Components:

| Path | Responsibility |
|---|---|
| `src/app/(app)/admin/layout.tsx` | Server layout rendering `<AdminGate><AdminNav />{children}</AdminGate>` — no `auth.protect()` here (project rule) |
| `src/components/admin/AdminGate.tsx` | `'use client'`; `useCurrentUser()`: loading → `LoanListSkeleton`; `role !== "admin"` → "Admins only" message + link to All tools; admin → children |
| `src/components/admin/AdminNav.tsx` | `'use client'`; heading "Admin" + links Loans / Listings / Users (same pill style as `AppHeader`, `aria-current`) |
| `src/components/admin/AdminLoansView.tsx` | `usePaginatedQuery(api.admin.listLoans, isAdmin ? { filter, today } : "skip", { initialNumItems: ADMIN_PAGE_SIZE })` |
| `src/components/admin/AdminLoanFilter.tsx` | Status filter `Select` |
| `src/components/admin/AdminListingsView.tsx` | `tools.list` + remove flow |
| `src/components/admin/AdminRemoveToolDialog.tsx` | Confirm + `admin.removeTool`, toasts |
| `src/components/admin/AdminUsersView.tsx` | `usePaginatedQuery(api.admin.listUsers, …)` + trusted actions |
| `src/components/admin/LoadMoreButton.tsx` | Shared "Load more" for both paginated views |
| `src/components/users/TrustedLenderBadge.tsx` | Small `Badge` (`ShieldCheckIcon` + "Trusted Lender") reused everywhere |
| `src/components/layout/AppHeader.tsx` (modify) | "Admin" link appended only when `useCurrentUser().user?.role === "admin"`; active when `pathname.startsWith("/admin")` |
| `src/components/tools/ToolCard.tsx` (modify) | `ownerTrusted?: boolean` → badge next to "Lent by …" |
| `src/components/loans/LoanCard.tsx` (modify) | `counterpartTrusted?: boolean` → badge in the description; optional `meta?: ReactNode` (requested date in admin; future automation activity) |
| `AllToolsView`, `MyRequestsView` (modify) | Pass `owner.isTrustedLender` / `lender.isTrustedLender` |

States:

| View | Loading | Empty | Error |
|---|---|---|---|
| Gate | skeleton while auth / `users.current` resolve | — | — |
| Non-admin | — | "Admins only — this area is for neighborhood moderators." + link to All tools | — |
| Loans | `LoadingFirstPage` → skeleton; `LoadingMore` → button "Loading…" | "No loans yet." / "No loans with this status." / "No overdue loans." | `(app)/error.tsx` |
| Listings | skeleton | "No tools yet." / category variant | `(app)/error.tsx` |
| Users | skeleton | (never empty — the admin exists) | `(app)/error.tsx` |
| Actions | button disabled + "Removing…" / "Saving…" | — | `toast.error(getErrorMessage(err))` |

Success toasts: "Listing removed", "Marked as Trusted Lender", "Trusted Lender removed". Mobile (375px): one column of cards, filter full width above the list, `AdminNav` scrolls horizontally like the header, no horizontal page scroll. The header gains a 5th link for admins only — it already scrolls horizontally on mobile.

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `convex/schema.ts` | modify | `tools.removedAt?`, `tools.removedBy?`; `loans` index `by_status` |
| `convex/lib/users.ts` | modify | `publicUser` + validator gain `isTrustedLender` |
| `convex/lib/tools.ts` | modify | `deactivateTool(ctx, tool, removedBy)` writes `removedAt` / `removedBy` |
| `convex/tools.ts` | modify | `remove` passes `me._id`; missing-owner fallback gets `isTrustedLender: false` |
| `convex/lib/loans.ts` | modify | missing-user fallback in `loadLoanRefs` gets `isTrustedLender: false` |
| `convex/lib/validators.ts` | modify | `adminLoanFilterValidator` + type |
| `convex/lib/adminRules.ts` | create | `ADMIN_PAGE_SIZE`, `ADMIN_PAGE_MAX`, `ADMIN_LOAN_FILTERS` |
| `convex/lib/admin.ts` | create | `adminLoansQuery(ctx, filter, today)`, `clampPage(opts)`, `toAdminUserItem` |
| `convex/admin.ts` | create | `removeTool`, `listLoans`, `listUsers`, `setTrustedLender` |
| `convex/admin.test.ts` | create | convex-test (see *Testing*) |
| `convex/tools.test.ts`, `convex/loans.test.ts` | modify | Projection key assertions → `["_id", "isTrustedLender", "name"]`; `removedBy` / `removedAt` on owner removal |
| `src/types/admin.ts` | create | `AdminLoanItem`, `AdminUserItem` via `FunctionReturnType` |
| `src/lib/admin.ts` | create | Filter labels, empty-state messages |
| `src/app/(app)/admin/layout.tsx` | create | Gate + sub-nav |
| `src/app/(app)/admin/page.tsx` | create | `await auth.protect()` → `redirect("/admin/loans")` |
| `src/app/(app)/admin/loans/page.tsx` | create | `await auth.protect()` → `<AdminLoansView />` |
| `src/app/(app)/admin/listings/page.tsx` | create | `await auth.protect()` → `<AdminListingsView />` |
| `src/app/(app)/admin/users/page.tsx` | create | `await auth.protect()` → `<AdminUsersView />` |
| `src/components/admin/*` | create | See *Routes and UI* |
| `src/components/users/TrustedLenderBadge.tsx` | create | Shared badge |
| `src/components/layout/AppHeader.tsx` | modify | Admin-only link |
| `src/components/tools/ToolCard.tsx`, `AllToolsView.tsx` | modify | Trusted badge on owner |
| `src/components/loans/LoanCard.tsx`, `MyRequestsView.tsx` | modify | Trusted badge on lender; `meta` slot |
| `context/project-overview.md` | modify | Data model draft: `tools.removedAt?` / `removedBy?`, `loans` index `by_status`, `publicUser` includes `isTrustedLender` |

No new npm package; no new shadcn component.

## Manual Steps (User)

### Before implementation

None — no env vars, no Clerk/Convex dashboard change. Keep `npx convex dev` and `npm run dev` running. Accounts: **Admin** (the DEV admin), **A** (normal, owns tools), **B** (normal, borrower). If an account has the wrong role: DEV dashboard → *Functions* → `users:setRole` → `{ "userId": "<_id>", "role": "admin" | "user" }` (ids in *Data* → `users`).

### After implementation — browser checks (DEV, translation off)

1. As **A**: no "Admin" link in the header; open `/admin/loans` by URL → "Admins only" message (no data, no error page).
2. As **Admin**: "Admin" link visible → `/admin` lands on Loans. All loans of A and B are listed with both names; switch filters (Pending, Approved, Overdue…) → correct rows; "Load more" appears only with more than 20 loans.
3. As **B**: request A's Drill (pending). As **Admin** → Listings → Remove Drill → confirm → "Listing removed"; B's request shows Rejected · "Tool was removed"; Drill disappears from the board for everyone (reactive).
4. As **B**: request another of A's tools starting today; **A** approves. As **Admin**: Remove it → blocked with "Mark the loan as returned (or close it) before removing this tool."; after A marks it returned, removal works.
5. As **Admin** → Users: mark **A** as Trusted → "Trusted Lender" badge appears on A's cards on All tools and on B's My requests (without reload). Click again from another tab (idempotent, no error). Remove trusted → confirm → badge disappears.
6. Users list shows names, roles, trusted, joined date — **no emails**.
7. Demote **Admin** temporarily via dashboard `users:setRole` (role `user`) while `/admin/users` is open → the page switches to "Admins only" and the header link disappears; promote back.
8. As **Admin**, normal flows still apply: no Approve buttons on others' loans; Incoming / My requests show only own loans.
9. Mobile width (~375px): `/admin/*` pages, filter, sub-nav, dialogs; no horizontal page scroll.
10. Optional: dashboard → *Functions* → `admin:listUsers` with *Act as a user* = A → `FORBIDDEN`.

## Implementation Steps (Claude)

All against **DEV**. Re-check Convex pagination / shadcn APIs with Context7 while implementing.

1. Branch `feature/admin` from `main`.
2. `schema.ts` (optional tool fields, `by_status`); let the running `npx convex dev` push it and check its output.
3. `lib/users.ts` (`publicUser`), fallbacks in `tools.ts` / `lib/loans.ts`; `deactivateTool(…, removedBy)` + `tools.remove`; update existing tests' key assertions; `npm run test:run`.
4. `validators.ts`, `adminRules.ts`, `lib/admin.ts`, `convex/admin.ts`.
5. `convex/admin.test.ts`; `npm run test:run`.
6. Client: `TrustedLenderBadge`, `ToolCard` / `LoanCard` props, `AllToolsView`, `MyRequestsView`.
7. `src/types/admin.ts`, `src/lib/admin.ts`, `src/components/admin/*`, admin layout + pages, `AppHeader` link.
8. `context/project-overview.md` data model.
9. `npm run lint`, `npm run test:run`, `npm run build`; browser check with Playwright where possible, then guide the user through *Manual Steps*.
10. Run **auth-auditor** on `convex/admin.ts`, `convex/lib/admin.ts`, `convex/lib/users.ts`, `convex/lib/tools.ts`, `src/app/(app)/admin/**`.
11. Ask before committing; go through *PROD Impact* before merging.

## Hooks for Later Specs

- **Automation events from admin removals:** `admin.removeTool` → `deactivateTool` → `closeLoansForRemovedTool` → `transitionLoan(…, "rejected", { closeReason: "tool_removed" })` for each pending request. When the automation spec adds its scheduler call inside `transitionLoan`, admin removals emit the same per-loan events as owner removals with **no change here**. The notification can read `tool.removedBy` and compare it with `tool.ownerId` to say "removed by a moderator". A "your listing was removed" event to the **owner** (no loan involved) would be a new hook in `admin.removeTool` — decided by the automation spec.
- **Trusted Lender changes:** `admin.setTrustedLender` is the single writer of `isTrustedLender`; a "you are now a Trusted Lender" notification would hook there.
- **Automation activity (bonus F):** `LoanCard`'s new `meta` slot in `AdminLoansView` is where "Reminder sent 2 days ago" goes; the automation spec adds `automationLogs` with an index `by_loan` and loads the latest log per loan **for the current page only** (same pattern as `loadLoanRefs`).
- **Overdue:** the Overdue filter uses the same `by_status_end` range as `listOverdue`, so the admin view and the reminders workflow agree on what is overdue (given the same `today`).

## PROD Impact

Merging to `main` runs `npx convex deploy` on Convex prod:

- **Schema:** `tools.removedAt?` / `removedBy?` (optional — existing PROD tools stay valid; tools removed before this deploy simply have no `removedBy`); new `loans` index `by_status` (backfilled; PROD has few loans). No migration.
- **Functions:** new `admin:*`. `publicUser` gains `isTrustedLender` — additive; the old frontend keeps working during the window between Convex deploy and the new Next.js build. `tools.remove` behavior unchanged for owners.
- **Data:** all PROD users have `isTrustedLender: false` until the PROD admin marks someone. The PROD admin (History) gets the new Admin link automatically.
- No env vars, no Clerk change, no n8n change.

Check before merging:

- [ ] `npm run build` / `lint` / `test:run` pass
- [ ] DEV verified with Admin + two normal accounts (*Manual Steps*)
- [ ] auth-auditor: no critical/high findings
- [ ] No admin function lacks `requireAdmin` as its first call; no admin return contains `email` / `tokenIdentifier`
- [ ] User confirms the merge (push to `main` = PROD deploy)
- [ ] After deploy (by the user, or by Claude only with explicit permission): the PROD admin sees `/admin`; a normal PROD account sees "Admins only"; mark/unmark Trusted on a test account round-trips

Rollback: Vercel Instant Rollback doesn't revert Convex; revert the commit on `main`, **keeping `removedAt` / `removedBy` in the schema** if any PROD tool was removed after the deploy (otherwise the schema push fails validation).

## Acceptance Criteria

- [ ] Schema pushed to DEV without errors: optional `tools.removedAt` / `removedBy`, `loans.by_status`
- [ ] `admin.removeTool`, `admin.listLoans`, `admin.listUsers`, `admin.setTrustedLender` exist; each rejects signed-out (`UNAUTHENTICATED`) and plain users (`FORBIDDEN`)
- [ ] Admin removal reuses `deactivateTool`: works on another user's tool, auto-rejects pending (`tool_removed`), `CONFLICT` with an approved loan, sets `removedBy` = admin and `removedAt`; owner removal sets `removedBy` = owner
- [ ] `listLoans` is paginated, filters via index (`by_creation_time`, `by_status`, `by_status_end`), no `.filter`; items expose parties only as `{ _id, name, isTrustedLender }`; `isOverdue` correct; `numItems` clamped to 50
- [ ] `listUsers` is paginated and returns no `email` / `tokenIdentifier`
- [ ] `setTrustedLender` is idempotent, admin-only, never touches `role`
- [ ] `publicUser` includes `isTrustedLender`; badge on the All tools board (owner), My requests (lender), admin views; `listPublic` unchanged
- [ ] `/admin`, `/admin/loans`, `/admin/listings`, `/admin/users` each start with `await auth.protect()`; non-admins see "Admins only"; Admin nav link only for admins
- [ ] Confirm dialogs, toasts, loading/empty/error states, 375px layout
- [ ] No role editing in the UI; `users.setRole` still internal
- [ ] No new npm package or shadcn component; `npm run lint`, `npm run test:run`, `npm run build` pass
- [ ] No `--prod` command run; no secrets in tracked files

## Testing

### Unit (convex-test) — `convex/admin.test.ts`

Setup as in `convex/tools.test.ts` / `convex/loans.test.ts`: Alice (owner), Bob (borrower), Carol (admin via `internal.users.setRole`), `errorCode()` helper, fake timers at `2026-11-12T12:00:00Z`, `today: "2026-11-12"`. Seed loans in specific states with `t.run` + `ctx.db.insert` where the public flow is not the subject.

- **Guards (every admin function):** signed out → `UNAUTHENTICATED`; Alice/Bob → `FORBIDDEN`; data unchanged after a rejected call
- **removeTool:** Carol removes Alice's active tool → `isActive: false`, `removedBy: carolId`, `removedAt` set; Bob's pending requests → `rejected` + `tool_removed` + `decidedAt`; approved loan (future or started) → `CONFLICT`, tool still active, loans untouched; already removed / unknown id → `NOT_FOUND`; Carol removing her own tool works
- **tools.remove (regression):** owner removal sets `removedBy: aliceId`; admin non-owner via `tools.remove` still `FORBIDDEN`
- **listLoans:** seed loans in all 5 statuses across two tools/borrowers; `all` returns every loan newest first; each status filter returns exactly that status newest first; `overdue` returns only approved with `endDate < today`, oldest end first, `endDate === today` excluded; pagination: `numItems: 2` → `isDone: false` + `continueCursor`, second call with the cursor returns the rest without duplicates; `numItems: 500` → page ≤ 50; item keys = `loanItemFields` + `borrower` + `lender`; `borrower` / `lender` keys exactly `["_id", "isTrustedLender", "name"]`; tool name present after removal; bad `today` → `INVALID_ARGUMENT`
- **listUsers:** returns all stored users newest first; keys exactly `["_creationTime", "_id", "isMe", "isTrustedLender", "name", "role"]` (no `email`, no `tokenIdentifier`); `isMe` true only for Carol; pagination with a cursor
- **setTrustedLender:** set true → `isTrustedLender: true`; set true again → no error, still true; set false → false; `role` unchanged in all cases; unknown user id → `NOT_FOUND`; extra `role` arg (cast) → validator rejects
- **Badge in projections:** after trusting Alice → `tools.list` `owner.isTrustedLender === true` for her tools and `false` for others; `loans.listMyRequests` (Bob) `lender.isTrustedLender === true`; `admin.listLoans` `lender.isTrustedLender === true`; `tools.listPublic` keys still `["_id", "category", "name"]`
- **Admin as a normal user:** Carol can `loans.request` Alice's tool; cannot `approve` / `reject` / `markReturned` Alice's loans or `cancel` Bob's (`FORBIDDEN`); `listMyRequests` / `listIncoming` return only Carol's own loans; Carol cannot request her own tool
- **API surface:** `api.admin` exposes exactly `removeTool`, `listLoans`, `listUsers`, `setTrustedLender`; `api.users` still exposes only `store` and `current`

Existing suites: update `["_id", "name"]` projection assertions in `convex/tools.test.ts` and `convex/loans.test.ts`.

### Manual (browser, DEV)

See *Manual Steps (User)*.

## Out of Scope

- Changing roles from the UI (`users.setRole` stays internal, dashboard only)
- User bans, suspensions, deleting users
- Editing other users' listings; restoring removed listings; a "removed listings" view
- Forcing removal during an approved loan; admin acting on loans (approve/reject/return/cancel on others' behalf)
- Moderation reason text, moderation log table, per-user counts / stats, user search
- n8n, notifications, HTTP endpoints, `automationLogs`, automation activity UI (later specs; see *Hooks*)
- Server-side role check / Next.js `forbidden()` on admin pages (Decision 6)
- Any PROD action beyond the automatic deploy on merge

## Doc Conflicts

| Topic | Conflict | Followed |
|---|---|---|
| `publicUser` shape | schema-rbac / tools-public-page: other users see `_id` + `name` only; tools tests assert `owner` has no `isTrustedLender` | Adds `isTrustedLender` (public by design — it's a badge) (Decision 5); tests updated. |
| `tools.ts` untouched | tools-public-page: "admin spec adds `admin.removeTool` … no change to `tools.ts` needed" | `tools.remove` changes one argument (`removedBy`) for the audit fields (Decision 2). |
| Admin loans index | loans spec hook: "read via `by_status_end` / `_creationTime`" | Adds `by_status` for newest-first per status (Decision 3b); overdue keeps `by_status_end`. |
| Trusted Lender | Overview: "mark a lender as Trusted Lender" (set only) | Set **and** unset (`setTrustedLender` with a target value) (Decision 8). |
| Admin removal | loans spec: "the admin spec decides about forcing it" | Not forced (Decision 1). |
| Non-admin handling | Next.js docs recommend `forbidden()` for role-based route protection | Client gate; `forbidden()` is experimental (`authInterrupts`) and the role lives in Convex (Decision 6). |

## References

- Convex — Paginated queries (`paginate`, `paginationOptsValidator`, `usePaginatedQuery`, transforming `page`, cursor validity per exact query, `.filter` cost, page sizes change, `maximumRowsRead`): https://docs.convex.dev/database/pagination
- Convex — `convex/server` API (`paginationOptsValidator` + `usePaginatedQuery` example): https://docs.convex.dev/api/modules/server
- Convex — `convex/react` API (`UsePaginatedQueryResult` statuses): https://docs.convex.dev/api/modules/react
- Convex — Best practices (helper functions for authorization, `ctx.auth` not spoofable args, redundant indexes unless sort differs): https://docs.convex.dev/understanding/best-practices
- Convex — Other recommendations (helper functions share business/authorization logic): https://docs.convex.dev/understanding/best-practices/other-recommendations
- Convex — Schemas (`v.optional`, staged validators): https://docs.convex.dev/database/schemas
- Convex — Deploying to production, "Making safe changes" (adding tables / optional fields is safe): https://docs.convex.dev/production/overview
- Convex — Next.js server rendering (`fetchQuery` / `preloadQuery` with Clerk `getToken()`, non-reactive, beta, stateless client): https://docs.convex.dev/client/nextjs/app-router/server-rendering
- Convex — convex-test: https://docs.convex.dev/testing/convex-test
- Next.js — `forbidden()` (experimental, `authInterrupts`): https://nextjs.org/docs/app/api-reference/functions/forbidden
- shadcn/ui — base-nova `tabs` registry item (`@base-ui/react/tabs`, not installed): https://ui.shadcn.com/r/styles/base-nova/tabs.json
- shadcn/ui — base-nova `table` registry item (container `overflow-x-auto`, not installed): https://ui.shadcn.com/r/styles/base-nova/table.json
- Local package sources (read 2026-11-12): `node_modules/convex/dist/esm-types/server/pagination.d.ts` (`paginationResultValidator`), `node_modules/convex/dist/esm-types/react/use_paginated_query.d.ts` (`"skip"` accepted), `node_modules/convex-test/dist/index.js` (supports `paginate`, **one paginated query per function**)
- Project: `CLAUDE.md`, `context/project-overview.md`, `context/coding-standards.md`, `context/ai-interaction.md`, `context/current-feature.md`, `context/features/schema-rbac.md`, `context/features/tools-public-page.md`, `context/features/loans.md`; code in `convex/` and `src/` (read 2026-11-12)

Source notes: the convex-test docs page doesn't mention pagination; its source code was checked instead (supports `paginate`, throws on a second `.paginate()` in one function — the design uses one). The Next.js docs recommend `forbidden()` for role checks, but assume the role is available server-side; here it lives in Convex, so the Convex docs' caveats on server fetching were followed (Decision 6). `convex-helpers` custom functions were not adopted (Decision 7); Convex's own best-practices page (helper functions) was followed.
