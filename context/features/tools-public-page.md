# Tools + Public Page — Public Board and Tool Listings CRUD (DEV)

## Overview

Visitors see a public board of available tools; signed-in users manage their own listings.

- a **`tools`** table (owner link, name, category, condition, short description, soft-delete flag) with shared validators and indexes
- a **public query** for the visitor board that returns **only `_id`, name and category** — no owner data
- authenticated queries: **All tools** (filterable by category, with availability status) and **My listings**
- owner-only **create / edit / delete** mutations enforced in Convex with the existing helpers (`requireUser`)
- the real public page `/` (name, tagline, public list, "Sign in to lend or borrow")
- an authenticated area (`/tools`, `/tools/mine`) with navigation, create/edit dialog, delete confirmation and Sonner toasts
- convex-test coverage for the authorization and validation rules

Targets the **DEV environment**. The schema and functions reach Convex **prod** automatically on the next `main` push (see *PROD Impact*).

## Prerequisites

Already done (see `context/current-feature.md` → *History*):

- Next.js 16.4 (App Router, `cacheComponents: true`, `partialPrefetching: true`, React Compiler), Tailwind v4, shadcn/ui `base-nova` (installed UI: `button`, `sonner`), `@base-ui/react` 1.9
- `ClerkProvider` → `ConvexClientProvider` (`ConvexProviderWithClerk` + `<UserSync />`) in `src/app/layout.tsx`; `<Toaster />` mounted
- `src/proxy.ts`: bare `clerkMiddleware()` (all routes public at the proxy level)
- `convex/schema.ts` with `users` (`tokenIdentifier`, `name`, `email?`, `role`, `isTrustedLender`, index `by_token`)
- `convex/lib/auth.ts`: `getCurrentUser`, `requireUser`, `requireAdmin`, `userByToken`
- `convex/lib/errors.ts`: `AppErrorData { code, message }`, codes `UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND`, throw helpers typed `never`
- `convex/lib/validators.ts`: `roleValidator`
- Client: `useCurrentUser()` (`{ isLoading, isAuthenticated, user }`), `getErrorMessage(error)` in `src/lib/errors.ts`, `AuthStatus` on the placeholder home
- **Carry-over rules from schema-rbac** (apply here): a `publicUser` projection (`_id`, `name`) — never return raw `users` docs; email is display-only and never an auth key; actions call internal queries/mutations instead of `requireUser` (no actions in this feature)
- PROD: Vercel builds `main` with `npx convex deploy --cmd 'npm run build'`

## Requirements

- `tools` table + indexes; category/condition validators and constants shared by schema, functions and client
- Public query `tools.listPublic` (visitors): `{ _id, name, category }[]` of available tools only
- Authenticated queries `tools.list` (optional `category` filter) and `tools.listMine`
- Mutations `tools.create`, `tools.update`, `tools.remove` — **owner only**; owner is always `me._id` from `requireUser`, never an argument
- Server-side argument validation: enums via `v.union(v.literal(...))`, lengths/trim in the handler (`INVALID_ARGUMENT`)
- Public page `/` and authenticated pages `/tools` and `/tools/mine`, protected server-side with Clerk `auth.protect()` (see Decision 6)
- Errors surfaced via Sonner toast; loading / empty / error states; responsive down to mobile width
- convex-test coverage (see *Testing*)

## Decisions

| # | Topic | Options considered | Decision and why |
|---|---|---|---|
| 1 | **Delete semantics** | (a) Hard delete (`ctx.db.delete`); (b) soft delete with `isActive: boolean` (draft field); (c) soft delete with `deletedAt?: number` | **(b) `isActive` soft delete.** The loans spec will store `loans.toolId`; a hard delete leaves dangling ids in loan history (and in My requests / Incoming requests / admin "view all loans"), forcing every loan read to handle a missing tool or cascading deletes of history. `isActive` keeps history intact, is already in the draft model, and a boolean is **indexable as the first index field**, so "active only" is an index range, not a `.filter` (see Data Model). (c) needs `deletedAt === undefined` in index ranges — works, but the boolean is simpler to read and matches the draft. There is **no restore** flow; a removed tool is invisible everywhere (public, All tools, My listings) and edits/removes on it return `NOT_FOUND`. All deactivation goes through one helper, `deactivateTool(ctx, tool)`, so the loans spec can add its rule there (e.g. block removal during an approved loan, auto-reject pending requests) and the admin spec can reuse it. |
| 2 | **Availability** | (a) Stored field on `tools` (e.g. `status: "available" \| "on_loan"` or `currentLoanId`) kept in sync by loan mutations; (b) **derived** from `loans` at read time through one helper | **(b) derived, via `getAvailability(ctx, tool)` in `convex/lib/tools.ts`.** Loans don't exist yet, so today the helper returns `"available"` for every active tool. The loans spec only changes this helper (e.g. "an `approved` loan for this tool whose period covers today → `on_loan`", via a `loans` index like `by_tool_status`) and every query — public, All tools, My listings — picks it up. A stored field (a) duplicates loan state and can drift (approve/return/expiry must all update it, and date-based "on loan today" changes without any write). The read cost of (b) is one indexed lookup per tool on a bounded list (Decision 4) — fine for a neighborhood board. If it ever becomes hot, the loans spec can denormalize `currentLoanId` behind the same helper without touching callers. `availabilityValidator = "available" \| "on_loan"` is defined now so return types and the UI badge don't change later. |
| 3 | **Rendering of `/`** | (a) Client `useQuery` (loading state on first paint, no data in HTML); (b) server `fetchQuery` (data in HTML, **not reactive**); (c) server `preloadQuery` in a Server Component + `usePreloadedQuery` in a Client Component | **(c) `preloadQuery`.** The public page is the one page that benefits from data in the first HTML (SEO, no spinner for visitors) and it stays **reactive** after hydration (new listings appear live). The public query needs **no auth token**, which removes the main complication of server-side Convex calls. Constraints from the docs, all handled: `preloadQuery` uses `cache: 'no-store'` → with `cacheComponents: true` the call must sit inside `<Suspense>` (static shell = hero + skeleton; list streams at request time); server rendering support is marked **beta** and separate server calls may be inconsistent → exactly **one** `preloadQuery` on the page. Authenticated pages use plain client `useQuery` (they need the Clerk token, are not indexed by search engines, and the client is already authenticated). Fallback if `preloadQuery` misbehaves after 2–3 attempts: switch `/` to (a) — the query and components don't change. |
| 4 | **Pagination** | (a) `.paginate()` + `usePaginatedQuery` ("Load more"); (b) unbounded `.collect()`; (c) **bounded** `.take(N)` on an index | **(c) bounded `.take()`**: `MAX_BOARD_TOOLS = 200` for `listPublic` / `list`, `MAX_OWN_TOOLS = 100` for `listMine`. Convex best practices: `.collect()` only for small/bounded results, paginate when unbounded. A neighborhood board is small; `.take` keeps it bounded (no limit errors, predictable cost) without the "Load more" UI, cursor state and per-filter pagination resets that (a) adds. (b) is rejected as unbounded. Upgrade path: switch the two board queries to `paginate` if a neighborhood ever exceeds the cap — the index design already supports it. |
| 5 | **Categories and conditions** | Free text vs fixed enums; small vs large list | **Fixed enums** (stable filter values, no typos, validated by Convex). Categories: `power_tools`, `hand_tools`, `garden`, `kitchen`, `camping`, `cleaning`, `ladders`, `other` — covers the overview's examples plus the most common neighborhood items, with `other` as a catch-all so users are never blocked. Condition scale: `like_new`, `good`, `fair`, `worn` (4 steps, plain language, no "new" because lent items are used by definition). Stored as snake_case keys; human labels live in a client-side map (`src/lib/tools.ts`). Adding a value later is non-breaking; **removing/renaming** one needs a data migration — say so in that spec. |
| 6 | **Route protection** | (a) `createRouteMatcher(['/tools(.*)'])` + `auth.protect()` in `src/proxy.ts`; (b) `auth.protect()` in each protected Server Component page, proxy stays bare `clerkMiddleware()` | **(b).** `createRouteMatcher` is **deprecated** in the installed `@clerk/nextjs` 7.9.25 (one-time dev warning; removal in the next major). Clerk's migration guide: proxy/middleware path matching gives "a false sense of security" (path normalization bugs, public middleware bypasses) and recommends `auth.protect()` per resource. This is UI defense-in-depth anyway — **authorization lives in Convex** (`requireUser` / ownership checks). `auth.protect()` reads request data, so with `cacheComponents` the protected page renders inside the `(app)` layout's `<Suspense>`. Conflicts with the task brief and `coding-standards.md` → see *Doc Conflicts*. |
| 7 | **Forms** | (a) shadcn `Field` + React Hook Form (shadcn forms docs); (b) TanStack Form; (c) shadcn `Field` components + controlled `useState` + Zod `safeParse` | **(c).** Neither `react-hook-form` nor `@tanstack/react-form` is installed; one 4-field form doesn't justify a new dependency. Zod (installed) gives instant client feedback; **Convex remains the source of truth** (same limits imported from `convex/lib/toolRules.ts`, enums from `convex/lib/validators.ts`). Field-level errors use `Field` / `FieldLabel` / `FieldError` with `data-invalid` / `aria-invalid` as in the shadcn docs. |
| 8 | **Create/edit UI** | (a) Separate routes `/tools/new`, `/tools/[toolId]/edit` (+ a `tools.get` query); (b) **dialog** on My listings | **(b) dialog** (`ToolFormDialog`) reusing the row already loaded by `listMine` — no extra query, no extra protected routes. A tool detail route (`/tools/[toolId]`) belongs to the loans spec (where "request this tool" lives). |
| 9 | **Signed-in/out rendering** | Clerk `<Show when="signed-in">` (v7 replacement for the **removed** `<SignedIn>` / `<SignedOut>`) vs Convex `<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` | **Convex components** (already used in `AuthStatus`): they wait until Convex has validated the token, so a child calling a Convex query never runs with a missing identity. `<SignedIn>` / `<SignedOut>` must not be used (removed in Clerk v7 Core 3). `SignInButton` (still exported in v7) wraps the shadcn `Button`. |

## Data Model

```ts
// convex/lib/validators.ts (additions)
export const TOOL_CATEGORIES = [
  "power_tools", "hand_tools", "garden", "kitchen",
  "camping", "cleaning", "ladders", "other",
] as const;
export const TOOL_CONDITIONS = ["like_new", "good", "fair", "worn"] as const;

export const toolCategoryValidator = v.union(...TOOL_CATEGORIES.map((c) => v.literal(c)));
export const toolConditionValidator = v.union(...TOOL_CONDITIONS.map((c) => v.literal(c)));
export const availabilityValidator = v.union(v.literal("available"), v.literal("on_loan"));

export type ToolCategory = Infer<typeof toolCategoryValidator>;   // "power_tools" | ...
export type ToolCondition = Infer<typeof toolConditionValidator>;
export type Availability = Infer<typeof availabilityValidator>;
```

> If `v.union(...array.map(v.literal))` does not infer the literal union with the installed `convex@1.49` typings, write the literals out explicitly and keep the `as const` arrays for the client (`z.enum(TOOL_CATEGORIES)`, select options). Verify with `tsc` during implementation.

```ts
// convex/schema.ts (addition)
tools: defineTable({
  ownerId: v.id("users"),
  name: v.string(),                 // trimmed, 2–60 chars (checked in handler)
  category: toolCategoryValidator,
  condition: toolConditionValidator,
  description: v.string(),          // trimmed, 0–500 chars; "" allowed
  isActive: v.boolean(),            // false = removed (soft delete)
})
  .index("by_active_category", ["isActive", "category"])
  .index("by_owner_active", ["ownerId", "isActive"]),
```

| Field | Written by | Notes |
|---|---|---|
| `ownerId` | `tools.create` (insert only, = `me._id`) | Never an argument; never patched |
| `name`, `category`, `condition`, `description` | `create`, `update` | `update` replaces all four (the form always sends the full set) |
| `isActive` | `create` (`true`), `deactivateTool` (`false`) | No public path sets it back to `true` |

Indexes:

- `by_active_category` — `listPublic` / `list` without filter: `q.eq("isActive", true)`; with filter: `q.eq("isActive", true).eq("category", c)`. Prefix use of a compound index is supported (equalities in index field order).
- `by_owner_active` — `listMine`: `q.eq("ownerId", me._id).eq("isActive", true)`.
- No `.filter` anywhere. Results are sorted by `name` in JS **after** the bounded `.take()` (index order is category-then-creation-time; alphabetical is friendlier on screen).
- The loans spec will add its own `loans` indexes for `getAvailability`; no `tools` index change expected.

Text rules (`convex/lib/toolRules.ts`, imported by the client too):

```ts
export const TOOL_NAME_MIN = 2;
export const TOOL_NAME_MAX = 60;
export const TOOL_DESCRIPTION_MAX = 500;
export const MAX_BOARD_TOOLS = 200;
export const MAX_OWN_TOOLS = 100;
```

New error code: `AppErrorCode` gains `"INVALID_ARGUMENT"` + `invalidArgument(message)` helper in `convex/lib/errors.ts` (e.g. "Tool name must be between 2 and 60 characters."). Enum/shape errors are rejected earlier by the Convex args validator (generic, non-`ConvexError` → client shows the generic message; the client form prevents them in practice).

## Convex Functions

| Function | Type | Who can call | Args | Returns |
|---|---|---|---|---|
| `tools.listPublic` | `query` (public) | Anyone (no auth used) | `{}` | `{ _id, name, category }[]` — active **and** available, sorted by name, max 200 |
| `tools.list` | `query` (public, `requireUser`) | Signed-in stored user | `{ category?: ToolCategory }` | `ToolListItem[]` (below), active, sorted by name, max 200 |
| `tools.listMine` | `query` (public, `requireUser`) | Signed-in stored user | `{}` | `MyToolItem[]` — caller's active tools only, max 100 |
| `tools.create` | `mutation` (public, `requireUser`) | Signed-in stored user | `{ name, category, condition, description }` | `Id<"tools">` |
| `tools.update` | `mutation` (public, `requireUser` + owner) | Owner of an active tool | `{ toolId, name, category, condition, description }` | `null` |
| `tools.remove` | `mutation` (public, `requireUser` + owner) | Owner of an active tool | `{ toolId }` | `null` (soft delete) |

Return shapes (each function declares a `returns` validator; no raw docs are returned):

```ts
// ToolListItem (tools.list)
{ _id, name, category, condition, description,
  owner: { _id: Id<"users">, name: string },   // publicUser projection — no email/role/token
  isMine: boolean,
  availability: Availability }

// MyToolItem (tools.listMine)
{ _id, name, category, condition, description, availability, _creationTime }
```

Shared server helpers:

- `convex/lib/users.ts` — `publicUser(user: Doc<"users">) → { _id, name }` + `publicUserValidator` (the carry-over projection; reused by loans/admin).
- `convex/lib/tools.ts`:
  - `normalizeToolInput(args)` → trims `name` / `description`, enforces lengths, throws `invalidArgument`
  - `requireOwnedActiveTool(ctx, me, toolId)` → `notFound("Tool not found.")` if missing or `!isActive`; `forbidden("You can only change your own listings.")` if `ownerId !== me._id`
  - `deactivateTool(ctx, tool)` → `ctx.db.patch(tool._id, { isActive: false })` (single extension point for loans/admin rules)
  - `getAvailability(ctx, tool)` → `"available"` for now (Decision 2)
- `tools.list` resolves owners with `ctx.db.get(ownerId)` deduplicated through a `Map` (bounded by the 200-tool cap). A missing owner row (should not happen — users are never deleted) maps to `{ _id, name: "Neighbor" }`.

Reactive queries and setup timing: `tools.list` / `listMine` use `requireUser` and would throw "still being set up" in the brief window before `users.store` runs. The client therefore passes `"skip"` until `useCurrentUser().user` is non-null — the server check stays strict, the UI never renders a thrown query.

Admin readiness: `tools.remove` stays **owner-only** (an admin acting through it gets `FORBIDDEN` on others' tools). The admin spec adds a separate `requireAdmin`-guarded mutation (e.g. `admin.removeTool`) that calls the same `deactivateTool` — no change to `tools.ts` needed.

## Authorization Matrix

| Function | Visitor (signed out) | user — owner | user — non-owner | admin |
|---|---|---|---|---|
| `tools.listPublic` | ✅ `_id`, name, category only | ✅ same | ✅ same | ✅ same |
| `tools.list` | ❌ `UNAUTHENTICATED` | ✅ all active tools; `isMine: true` on own | ✅ all active tools; owner shown as `{ _id, name }` | ✅ same as user (no extra fields) |
| `tools.listMine` | ❌ `UNAUTHENTICATED` | ✅ own active tools only | ✅ own only (never others') | ✅ own only |
| `tools.create` | ❌ `UNAUTHENTICATED` | ✅ `ownerId = me._id` | ✅ `ownerId = me._id` (an `ownerId` arg is rejected by the validator) | ✅ same as user |
| `tools.update` | ❌ `UNAUTHENTICATED` | ✅ own active tool | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` on others' tools (admin power comes with the admin spec) |
| `tools.remove` | ❌ `UNAUTHENTICATED` | ✅ soft delete own | ❌ `FORBIDDEN` | ❌ `FORBIDDEN` on others' tools (admin spec) |
| update/remove on removed or unknown tool | ❌ `UNAUTHENTICATED` | ❌ `NOT_FOUND` | ❌ `NOT_FOUND` | ❌ `NOT_FOUND` |

Order of checks in mutations: `requireUser` → load tool → `NOT_FOUND` → owner check `FORBIDDEN` → `normalizeToolInput` → write. (Auth before validation, so unauthenticated callers learn nothing about tools.)

## Routes and UI

| Route | Access | Rendering | Content |
|---|---|---|---|
| `/` | Public | Server page; static hero + `<Suspense>` around the `preloadQuery` loader | "LendLoop", tagline *"Borrow what you need. Lend what you don't."*, auth CTA, public tool grid |
| `/tools` | Signed in (`auth.protect()`) | Server page → client `AllToolsView` | "All tools": category filter (`Select`, "All categories" + 8 options), grid of `ToolCard`s with availability badge, owner name, "Yours" badge |
| `/tools/mine` | Signed in (`auth.protect()`) | Server page → client `MyListingsView` | "My listings": "Add a tool" button → `ToolFormDialog`; each card with Edit (dialog) and Remove (`AlertDialog`) |

Layout: route group `src/app/(app)/layout.tsx` (URLs stay `/tools`, `/tools/mine`; future loans views join the group) renders `AppHeader` and wraps `children` in `<Suspense fallback={<ToolGridSkeleton />}>` (required by `cacheComponents` because pages call `auth.protect()`).

`AppHeader` (client): "LendLoop" link to `/`, nav links "All tools" / "My listings" (active via `usePathname`), `UserButton`. Mobile: nav links below the logo row, horizontally scrollable if needed; 16px side padding.

Home auth CTA (`AuthStatus`, rewritten): `<AuthLoading>` → small placeholder; `<Unauthenticated>` → `<SignInButton mode="modal" fallbackRedirectUrl="/tools"><Button>Sign in to lend or borrow</Button></SignInButton>`; `<Authenticated>` → `Link` button "Go to the board" (`/tools`) + `UserButton`. The name/email/role debug block is dropped (role display returns with the admin spec).

States:

| View | Loading | Empty | Error |
|---|---|---|---|
| Public list | Suspense fallback `ToolGridSkeleton` (server streaming) | "No tools listed yet. Be the first to lend one!" | `src/app/error.tsx` ("Couldn't load the board. Try again." + reset) |
| All tools | Skeleton while `useCurrentUser` / `useQuery` is `undefined` | "No tools in this category yet." / "No tools yet." | `src/app/(app)/error.tsx` (query errors propagate to the nearest error boundary) |
| My listings | Skeleton | "You haven't listed any tools yet." + "Add a tool" | same boundary |
| Mutations | Submit/confirm button disabled + "Saving…" / "Removing…" | — | `toast.error(getErrorMessage(err))`; dialog stays open with entered values |

Success toasts: "Tool listed", "Changes saved", "Tool removed". Grid: 1 column on mobile, `sm:` 2, `lg:` 3. Long names/descriptions wrap (`break-words`); description clamped to 3 lines on cards.

Form (`ToolFormDialog`): fields Name (`Input`), Category (`Select`, base-ui `items` API), Condition (`Select`), Description (`Textarea`, counter "x/500"). Zod schema `toolFormSchema` built from `TOOL_CATEGORIES`, `TOOL_CONDITIONS` and `toolRules` constants; validate on submit, show `FieldError` per field; on success close dialog + toast.

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `convex/lib/validators.ts` | modify | `TOOL_CATEGORIES`, `TOOL_CONDITIONS`, `toolCategoryValidator`, `toolConditionValidator`, `availabilityValidator` + types |
| `convex/lib/toolRules.ts` | create | Length limits and list caps (plain constants, safe to import on the client) |
| `convex/lib/errors.ts` | modify | Add `INVALID_ARGUMENT` code + `invalidArgument()` |
| `convex/lib/users.ts` | create | `publicUser()` + `publicUserValidator` |
| `convex/lib/tools.ts` | create | `normalizeToolInput`, `requireOwnedActiveTool`, `deactivateTool`, `getAvailability` |
| `convex/schema.ts` | modify | `tools` table + 2 indexes |
| `convex/tools.ts` | create | `listPublic`, `list`, `listMine`, `create`, `update`, `remove` (args + returns validators) |
| `convex/tools.test.ts` | create | convex-test (see *Testing*) |
| `convex/lib/tools.test.ts` | create | Unit tests for `normalizeToolInput` (pure) |
| `src/proxy.ts` | modify (comment only) | Keep bare `clerkMiddleware()`; update the comment to point to `auth.protect()` in `(app)` pages (Decision 6) |
| `src/app/page.tsx` | modify | Hero + `AuthStatus` + `<Suspense fallback={<ToolGridSkeleton />}><PublicToolListLoader /></Suspense>` |
| `src/app/error.tsx` | create | Root client error boundary |
| `src/app/(app)/layout.tsx` | create | `AppHeader` + `<Suspense>` around children |
| `src/app/(app)/error.tsx` | create | Error boundary for authenticated views |
| `src/app/(app)/tools/page.tsx` | create | `await auth.protect()` → `<AllToolsView />` |
| `src/app/(app)/tools/mine/page.tsx` | create | `await auth.protect()` → `<MyListingsView />` |
| `src/components/auth/AuthStatus.tsx` | modify | Home CTA (Decision 9 / *Routes and UI*) |
| `src/components/layout/AppHeader.tsx` | create | Logo, nav links, `UserButton` |
| `src/components/tools/PublicToolListLoader.tsx` | create | Async Server Component: `preloadQuery(api.tools.listPublic, {})` → `<PublicToolList preloaded={…} />` |
| `src/components/tools/PublicToolList.tsx` | create | `'use client'`; `usePreloadedQuery`; name + category badge only |
| `src/components/tools/AllToolsView.tsx` | create | `'use client'`; category filter state, `useQuery(api.tools.list, user ? { category } : "skip")` |
| `src/components/tools/MyListingsView.tsx` | create | `'use client'`; `listMine`, add/edit/remove wiring |
| `src/components/tools/ToolCard.tsx` | create | Presentational card (name, category, condition, description, owner, badges, optional actions slot) |
| `src/components/tools/ToolFormDialog.tsx` | create | Create/edit dialog with Zod validation; calls `create` / `update` |
| `src/components/tools/RemoveToolDialog.tsx` | create | `AlertDialog` confirmation; calls `remove` |
| `src/components/tools/CategoryFilter.tsx` | create | `Select` with "All categories" |
| `src/components/tools/ToolGridSkeleton.tsx` | create | Skeleton grid (server-safe) |
| `src/lib/tools.ts` | create | `CATEGORY_LABELS`, `CONDITION_LABELS`, `AVAILABILITY_LABELS`, `toolFormSchema` (Zod) |
| `src/types/tools.ts` | create | `ToolListItem`, `MyToolItem` via `FunctionReturnType<typeof api.tools.list>[number]` (generated types, no hand-written duplicates) |
| `src/components/ui/*` | create (shadcn) | `npx shadcn add input textarea select field label dialog alert-dialog badge card skeleton` (Claude runs it during implementation, on the feature branch) |
| `context/project-overview.md` | modify | Data model draft: `tools` final shape, availability derived from loans |
| `context/coding-standards.md` | modify | Route protection line (see *Doc Conflicts*) |

Snippets (clarity only):

```tsx
// src/app/page.tsx (shape)
export default function Home() {
  return (
    <main>
      {/* static hero: LendLoop + tagline + <AuthStatus /> */}
      <Suspense fallback={<ToolGridSkeleton />}>
        <PublicToolListLoader />
      </Suspense>
    </main>
  );
}

// src/components/tools/PublicToolListLoader.tsx
export async function PublicToolListLoader() {
  const preloaded = await preloadQuery(api.tools.listPublic, {});
  return <PublicToolList preloaded={preloaded} />;
}

// src/app/(app)/tools/page.tsx
export default async function AllToolsPage() {
  await auth.protect();               // from "@clerk/nextjs/server"
  return <AllToolsView />;
}
```

```ts
// convex/tools.ts (shape)
export const remove = mutation({
  args: { toolId: v.id("tools") },
  returns: v.null(),
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await requireOwnedActiveTool(ctx, me, toolId);
    await deactivateTool(ctx, tool);
    return null;
  },
});
```

Imports from `convex/_generated/api` use relative paths, as in the existing code (no `@/convex` alias exists).

## Manual Steps (User)

### Before implementation

None. No new env vars, no Clerk or Convex dashboard change. Keep `npx convex dev` and `npm run dev` running.

### After implementation — browser checks (DEV, two accounts)

Use a normal window (account **A**) and a private window (account **B**).

1. Signed out on `http://localhost:3000`: hero, tagline, "Sign in to lend or borrow", empty-state message. Open `/tools` directly → redirected to Clerk sign-in.
2. Sign in as **A** → lands on `/tools` (empty). Go to **My listings** → add 2 tools (different categories). Try an empty name / 1-char name → field error, nothing saved.
3. Signed-out window: `/` shows both tools live (name + category only). Inspect the page source / network response: **no owner name, email or ids of users**.
4. Sign in as **B** → **All tools** shows A's tools with owner "A", no Edit/Remove buttons; category filter narrows the list. **My listings** for B is empty.
5. As **A**: edit a tool → change appears in B's window and on `/` without reload. Remove one → disappears everywhere.
6. Mobile width (DevTools ~375px): header, grid, dialogs usable, no horizontal scroll.
7. Optional (dashboard → dev → *Functions* → `tools:remove` → *Act as a user* B with A's `toolId`) → `FORBIDDEN`.

## Implementation Steps (Claude)

All against **DEV**. Re-check APIs with Context7 / official docs while implementing.

1. Create branch `feature/tools-public-page` from `main`.
2. `convex/lib/validators.ts`, `convex/lib/toolRules.ts`, `convex/lib/errors.ts` (`INVALID_ARGUMENT`), `convex/lib/users.ts`.
3. `convex/schema.ts` (`tools` + indexes); let the running `npx convex dev` push it — check its output.
4. `convex/lib/tools.ts`, then `convex/tools.ts` with args **and** returns validators.
5. Tests: `convex/tools.test.ts`, `convex/lib/tools.test.ts`; `npm run test:run`.
6. `npx shadcn add input textarea select field label dialog alert-dialog badge card skeleton`; review generated files (base-nova / base-ui APIs).
7. `src/lib/tools.ts`, `src/types/tools.ts`.
8. Public page: `PublicToolListLoader`, `PublicToolList`, `ToolGridSkeleton`, `src/app/page.tsx`, `AuthStatus`, `src/app/error.tsx`.
9. Authenticated area: `(app)/layout.tsx`, `AppHeader`, pages with `auth.protect()`, `AllToolsView`, `CategoryFilter`, `ToolCard`, `MyListingsView`, `ToolFormDialog`, `RemoveToolDialog`, `(app)/error.tsx`; update the `src/proxy.ts` comment.
10. Docs: `context/project-overview.md` (tools model, availability), `context/coding-standards.md` (route protection).
11. `npm run lint`, `npm run test:run`, `npm run build` (watch for `cacheComponents` "uncached data outside Suspense" / blocking-route errors). Verify in the browser with Playwright where possible; then guide the user through *Manual Steps*.
12. Run the **auth-auditor** agent on the new Convex functions and route protection.
13. Ask before committing. Before merging to `main`, go through *PROD Impact* with the user.

## PROD Impact

Merging to `main` triggers `npx convex deploy` to Convex prod:

- **Schema push:** new `tools` table (+ 2 indexes) on prod. Additive; `users` unchanged → no migration, no validation conflict.
- **Functions:** `tools:*` appear; `users:*` unchanged.
- **No new env vars** (Convex prod / Vercel); no Clerk "LendLoop Prod" change. `auth.protect()` redirects signed-out users to the "LendLoop Prod" sign-in (Account Portal of its Development instance) — the same flow already smoke-tested.
- `/` becomes **dynamic per request** for the list part (`preloadQuery` = `no-store`); the hero is still in the static shell. During `next build` on Vercel the list is postponed to request time, so the build does not need data (and `NEXT_PUBLIC_CONVEX_URL` is injected anyway).
- PROD starts with an **empty board** — expected.

Check before merging:

- [ ] `npm run build` / `lint` / `test:run` pass on the branch
- [ ] DEV verified in the browser with two accounts (*Manual Steps*)
- [ ] auth-auditor: no critical/high findings
- [ ] User confirms the merge (pushing `main` = PROD deploy)
- [ ] After the Vercel deploy: `/` loads signed out on https://lendloop-tawny.vercel.app; `/tools` redirects to sign-in; a signed-in user can create and remove a listing — check done by the user (or by Claude only with explicit permission)

Rollback: Vercel Instant Rollback restores the old Next.js build but **not** Convex prod functions/schema — revert the commit on `main`. If prod already has `tools` rows, the revert must **keep the `tools` table definition** in `schema.ts` (only remove the functions/UI) so the schema push cannot conflict with existing documents; confirm the exact behavior in DEV before a real rollback.

## Acceptance Criteria

- [ ] `tools` table with `ownerId`, `name`, `category`, `condition`, `description`, `isActive` and indexes `by_active_category`, `by_owner_active`; pushed to DEV without errors
- [ ] Category / condition enums defined once in `convex/lib/validators.ts` and reused by schema, functions and the client form
- [ ] `tools.listPublic` returns only `_id`, `name`, `category` of active, available tools; works signed out
- [ ] `tools.list` returns active tools with `owner: { _id, name }` (no email/role/token), `isMine`, `availability`; category filter works via index
- [ ] `tools.listMine` returns only the caller's active tools
- [ ] `create` sets `ownerId` from the caller; `update` / `remove` reject non-owners (`FORBIDDEN`), removed/unknown tools (`NOT_FOUND`), signed-out callers (`UNAUTHENTICATED`)
- [ ] `remove` is a soft delete (`isActive: false`); removed tools disappear from every list
- [ ] Name 2–60 chars (trimmed), description ≤ 500 chars enforced server-side (`INVALID_ARGUMENT`) and client-side
- [ ] No `.filter` on database queries; every list is bounded (`.take`)
- [ ] `/` shows "LendLoop", the tagline, the public list (server-rendered + reactive) and "Sign in to lend or borrow" (Clerk modal)
- [ ] `/tools` and `/tools/mine` redirect signed-out visitors to sign-in (`auth.protect()`); navigation between them works
- [ ] Create/edit dialog, remove confirmation, success/error toasts; loading, empty and error states present
- [ ] Usable at mobile width (no horizontal scroll)
- [ ] No use of removed Clerk `<SignedIn>` / `<SignedOut>`; no `createRouteMatcher`
- [ ] `npm run lint`, `npm run test:run`, `npm run build` pass
- [ ] No `--prod` command run; no secrets in tracked files

## Testing

### Unit (convex-test)

Setup as in `convex/users.test.ts`: `convexTest(schema, modules)`, seed users via `api.users.store` per identity, `errorCode()` helper for `ConvexError` codes; read raw rows with `t.run`.

`convex/tools.test.ts`:

- **listPublic**
  - signed out → works; returns only active tools
  - each item's keys are exactly `["_id", "category", "name"]` (no `ownerId`, `owner`, `description`, `condition`, `isActive`)
  - removed tools are excluded; result sorted by name
- **list**
  - signed out → `UNAUTHENTICATED`; identity without `users` row → `UNAUTHENTICATED`
  - returns tools of all owners; `owner` has exactly `_id` and `name` (no `email`, `role`, `tokenIdentifier`, `isTrustedLender`)
  - `isMine` true only for the caller's tools; `availability` is `"available"`
  - `{ category: "garden" }` returns only garden tools; invalid category string (cast) → rejected by validator
  - removed tools excluded
- **listMine**
  - signed out → `UNAUTHENTICATED`; returns only the caller's active tools (B's list never contains A's)
- **create**
  - signed out → `UNAUTHENTICATED`, no row inserted
  - success → row with `ownerId` = caller's `users._id`, `isActive: true`, trimmed `name` / `description`
  - extra `ownerId` arg (cast) → rejected by the args validator; no row
  - name `""`, `" a "`, 61 chars → `INVALID_ARGUMENT`; 2 and 60 chars → ok
  - description 501 chars → `INVALID_ARGUMENT`; `""` → ok
  - invalid `category` / `condition` (cast) → rejected
- **update**
  - owner → fields replaced, `ownerId` / `isActive` unchanged
  - non-owner → `FORBIDDEN`, row unchanged; admin non-owner (promoted via `internal.users.setRole`) → `FORBIDDEN`
  - signed out → `UNAUTHENTICATED`; removed tool → `NOT_FOUND`; same validation rules as create
- **remove**
  - owner → `isActive: false`, row still exists (soft delete); second remove → `NOT_FOUND`
  - non-owner and admin non-owner → `FORBIDDEN`, still active; signed out → `UNAUTHENTICATED`
- **API surface**: `api.tools` exposes exactly the six functions above (compile-time + runtime key check)

`convex/lib/tools.test.ts`: `normalizeToolInput` boundaries (trim, min/max lengths, unicode/emoji counted as JS string length — documented behavior).

### Manual (browser, DEV)

See *Manual Steps (User)* → *After implementation*.

## Out of Scope

- **Loans**: request / approve / reject / return, the `loans` table, My requests / Incoming requests views, a tool detail page with "Request" — loans spec (it plugs into `getAvailability` and `deactivateTool`)
- **Admin**: remove any listing, view all loans, Trusted Lender — admin spec (adds a `requireAdmin` mutation reusing `deactivateTool`; `tools.remove` stays owner-only)
- Restoring removed tools; showing removed tools anywhere
- Pagination / "Load more" (Decision 4), search by text, sorting options
- **n8n**, webhooks, automation activity
- Image uploads / Convex file storage
- Trusted Lender badge on cards (admin spec)
- Any PROD action beyond the automatic deploy on merge

## Doc Conflicts

| Topic | Conflict | Followed |
|---|---|---|
| Route protection mechanism | Task brief asks for `createRouteMatcher` in `src/proxy.ts`; `coding-standards.md` says "Route protection via Clerk `clerkMiddleware` in `src/proxy.ts`"; Clerk now **deprecates** `createRouteMatcher` (installed 7.9.25 ships the deprecation) and recommends `auth.protect()` per resource | **Clerk guide**: `auth.protect()` in each `(app)` page, proxy stays bare `clerkMiddleware()`. Update `coding-standards.md` → "Route protection via `auth.protect()` in protected pages; `clerkMiddleware()` in `src/proxy.ts` stays without route matching". |
| Pagination | Convex best practices: paginate potentially unbounded lists | Bounded `.take()` with caps (Decision 4) — the docs accept `.collect` / `.take` for small, bounded results. |
| Server rendering | Convex: server rendering is **beta**; multiple `preloadQuery` calls may be inconsistent | One `preloadQuery` on `/` only; fallback to `useQuery` documented (Decision 3). |
| Public list content | Overview: "available tools (name and category only)"; availability depends on loans that don't exist yet | All active tools count as available until the loans spec (Decision 2). `_id` is also returned (React keys; opaque, not owner data). |
| Forms | shadcn forms docs assume React Hook Form or TanStack Form | Plain state + Zod + shadcn `Field` (Decision 7) — no new dependency. |
| Signed-in/out components | Clerk v7 replaced `<SignedIn>` / `<SignedOut>` with `<Show>` | Convex `<Authenticated>` / `<Unauthenticated>` (already in use; wait for Convex auth). Removed Clerk components not used. |
| Draft data model | Overview draft has `tools.isActive` but no availability | Kept `isActive` (soft delete); availability derived — update the draft. |

## References

- Convex — Best practices (`.filter` vs indexes, `.collect` only for small results, pagination, access control): https://docs.convex.dev/understanding/best-practices
- Convex — Indexes (compound indexes, equality expressions in index field order): https://docs.convex.dev/database/reading-data/indexes
- Convex — Indexes and query performance: https://docs.convex.dev/database/reading-data/indexes/indexes-and-query-perf
- Convex — `OrderedQuery.collect` / `take` / `paginate` API: https://docs.convex.dev/api/interfaces/server.OrderedQuery
- Convex — ESLint `no-filter-in-query`: https://docs.convex.dev/eslint
- Convex — Next.js App Router server rendering (`preloadQuery`, `fetchQuery`, `no-store`, beta, consistency): https://docs.convex.dev/client/nextjs/app-router/server-rendering
- Convex — `convex/nextjs` API: https://docs.convex.dev/api/modules/nextjs
- Convex — Validators (`v.union`, `v.literal`, `Infer`): https://docs.convex.dev/functions/validation
- Convex — Application errors (`ConvexError`): https://docs.convex.dev/functions/error-handling/application-errors
- Convex — convex-test: https://docs.convex.dev/testing/convex-test
- Clerk — Migrate from `createRouteMatcher()` (deprecation, `auth.protect()` per resource): https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher
- Clerk — `<Show>` (replaces removed `<SignedIn>` / `<SignedOut>` / `<Protect>`): https://clerk.com/docs/reference/components/control/show (via Context7 `/clerk/clerk-docs`)
- Clerk — `clerkMiddleware()` / `auth.protect()`: https://clerk.com/docs/reference/nextjs/clerk-middleware
- Next.js — Caching / Cache Components (uncached data inside `<Suspense>`, static shell): https://nextjs.org/docs/app/getting-started/caching (via Context7 `/vercel/next.js`)
- shadcn/ui — Field: https://ui.shadcn.com/docs/components/field; forms with React Hook Form (pattern reference): https://ui.shadcn.com/docs/forms/react-hook-form; base-ui Select `items` API example: https://github.com/shadcn-ui/ui/blob/main/apps/v4/examples/base/field-select.tsx
- Installed packages checked locally: `node_modules/@clerk/nextjs` 7.9.25 (`Show`, `SignInButton` exported; `SignedIn`/`SignedOut` in `removedControlComponents`; `createRouteMatcher` deprecation), `node_modules/convex` 1.49.0 (`preloadQuery`, `fetchQuery`), `node_modules/@base-ui/react` (field, form, select, dialog, alert-dialog available)
- Project: `CLAUDE.md`, `context/project-overview.md`, `context/coding-standards.md`, `context/ai-interaction.md`, `context/current-feature.md`, `context/features/setup.md`, `context/features/setup-production.md`, `context/features/schema-rbac.md`
