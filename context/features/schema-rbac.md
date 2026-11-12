# Schema + RBAC — Users, Roles and Authorization Foundation (DEV)

## Overview

Build the authorization foundation every later feature depends on:

- a `convex/schema.ts` with the **`users`** table
- every signed-in Clerk user gets **exactly one** `users` row, kept in sync with the session token's `name` / `email`
- **roles live in Convex** (`role: "user" | "admin"`, `isTrustedLender`) and are enforced **server-side**
- reusable auth helpers in `convex/lib/auth.ts` (`getCurrentUser`, `requireUser`, `requireAdmin`) throwing `ConvexError` with user-friendly messages
- a safe way to provision the **first admin** (internal function only — never a public mutation)
- convex-test coverage proving the rules

Targets the **DEV environment**. The schema and functions reach Convex **prod** automatically on the next `main` push (see *PROD Impact*); promoting the first PROD admin is a separate, explicitly confirmed manual step.

No real pages: the client part is limited to "make sure the user row exists after sign-in" and replacing the temporary identity proof with the stored user.

## Prerequisites

Already done (Phases 3–4, see `context/current-feature.md` → *History*):

- Repo linked to Convex project `lendloop`: dev deployment `effervescent-squid-656`, prod deployment `enchanted-raven-234`
- `convex/auth.config.ts` (Clerk provider, `applicationID: "convex"`, issuer from `CLERK_JWT_ISSUER_DOMAIN` per deployment)
- `ClerkProvider` → `ConvexClientProvider` (`ConvexProviderWithClerk`) in `src/app/layout.tsx`; bare `clerkMiddleware()` in `src/proxy.ts`
- Both Clerk apps ("LendLoop Dev", "LendLoop Prod") have the Convex integration activated and the **same session token claims `name` / `email`** → `identity.name` / `identity.email` are available in Convex functions in both environments
- Temporary proof query `convex/whoami.ts` (+ `whoami.test.ts`) rendered by `src/components/auth/AuthStatus.tsx`
- No `convex/schema.ts` yet; tests call `convexTest(undefined, modules)`
- `vitest.config.ts`: global `environment: "edge-runtime"`, `server.deps.inline: ["convex-test"]` — works for Convex-only tests (no change needed)
- Vercel builds `main` with `npx convex deploy --cmd 'npm run build'` → pushes schema/functions to Convex prod

## Requirements

- `convex/schema.ts` with the `users` table and a `by_token` index (see *Data Model*)
- Public mutation `users.store` (no args): creates the caller's row on first call, patches `name` / `email` when they changed, **never** touches `role` / `isTrustedLender`; idempotent
- Public query `users.current`: returns a minimal projection of the caller's row, or `null` when signed out / not yet stored
- Internal mutation `users.setRole` for admin provisioning (CLI / dashboard only)
- `convex/lib/auth.ts`: `getCurrentUser`, `requireUser`, `requireAdmin`
- `convex/lib/errors.ts`: typed `ConvexError` data shape + small throw helpers
- Client: a component mounted once inside the Convex provider calls `users.store` after Convex auth succeeds; a `useCurrentUser` hook exposes `{ isLoading, isAuthenticated, user }`
- Remove `whoami` (query + test); `AuthStatus` shows the stored user (name, email, role) instead
- Mutation errors are surfaced via Sonner toast (`coding-standards.md` → *Error Handling*)
- convex-test coverage (see *Testing*)

## Decisions

| # | Topic | Options considered | Decision and why |
|---|---|---|---|
| 1 | **How a Clerk user becomes a `users` row** | (a) Client calls a `store` mutation after sign-in (Convex guide, option 1); (b) Clerk webhooks → Convex `httpAction` at `*.convex.site/clerk-users-webhook`, verified with `svix` (Convex guide, option 2) | **(a) client `store` mutation.** Everything we need (`subject`/`tokenIdentifier`, `name`, `email`) is already in the JWT — the Convex guide says webhooks are needed only to store information *not* in the JWT. (b) would add per environment: a webhook endpoint in **each** Clerk app, a `CLERK_WEBHOOK_SECRET` in **each** Convex deployment (prod change = extra confirmed PROD step), the `svix` + `@clerk/backend` dependencies, and an HTTP route to test — too much for a 2-day timeline with two Clerk apps. Accepted trade-offs of (a): the row is created on the user's first app load after sign-in (not at Clerk sign-up), profile changes sync on next load, and Clerk user deletion is not propagated (no delete flow is in the spec). |
| 2 | **Identity key** | `tokenIdentifier` vs `subject` (Clerk user ID, the draft's `clerkId`) | **`tokenIdentifier` with index `by_token`** — the field and index the Convex guide uses for the client-mutation approach. `tokenIdentifier` = `issuer` + `subject`, "to ensure uniqueness even when multiple providers are used". It also binds a row to a specific Clerk app, so a DEV token can never match a PROD row even if data were copied. `subject` alone is only needed for the webhook approach (webhook payloads carry the Clerk ID, not the issuer). The draft field `clerkId` is replaced by `tokenIdentifier`. |
| 3 | **Reusable auth checks** | (a) Plain helper functions `requireUser(ctx)` / `requireAdmin(ctx)`; (b) `convex-helpers` `customQuery` / `customMutation` with `customCtx` (e.g. `userQuery`, `adminMutation`) | **(a) plain helpers in `convex/lib/auth.ts`.** Convex best practices: "Most logic should be written as plain TypeScript functions"; custom functions "can be helpful" but are optional and come from the separate `convex-helpers` package (community-maintained by Convex, not part of `convex`). Plain helpers: zero new dependency, explicit at each call site (easy to audit — auth-auditor scope), trivially testable, and work identically in queries and mutations. Ergonomic cost: one line per function (`const me = await requireUser(ctx)`). Revisit only if later specs show heavy repetition. |
| 4 | **Where roles live** | (a) Convex `users.role` / `users.isTrustedLender`; (b) Clerk `publicMetadata` exposed via a session token claim (Clerk "basic RBAC" guide) | **(a) Convex.** RBAC must be enforced inside Convex functions (`project-overview.md`), and Convex is the system of record. (b) would require changing **both** Clerk apps (including "LendLoop Prod"), duplicate the role in two places, keep stale roles in the JWT until token refresh, and the admin "Trusted Lender" toggle would need the Clerk Backend API from a Convex action. With (a) a role change is a single transactional write and takes effect on the next function call. |
| 5 | **Schema scope** | (a) `users` only; (b) also `tools` / `loans` / `automationLogs` (schema + validators, no functions) | **(a) `users` only.** The other tables are still a DRAFT and their shape (dates, status transitions, idempotency keys) is decided by their own specs; defining them now would either freeze guesses or force edits later. Adding a table to the schema is non-breaking and cheap in Convex, and empty tables give no type stability benefit. What *is* shared now: `Doc<"users">` / `Id<"users">` (for `ownerId`, `borrowerId`, `lenderId`) and the exported `roleValidator`. |
| 6 | **Temporary `whoami.get`** | Keep / replace / remove | **Remove** (`convex/whoami.ts`, `convex/whoami.test.ts`). `users.current` replaces it as the end-to-end proof (identity → Convex → stored row), and it also shows the role. Keeping both would leave a second public function returning identity data with no purpose. |
| 7 | **First admin** | Public "make me admin" mutation (with secret / allowlist env var) vs `internalMutation` run by the operator | **`internalMutation` `users.setRole`**, run via `npx convex run` (DEV) or the Convex dashboard (PROD, by the user). Internal functions are not callable from clients, so there is no self-promotion path; no extra secret or env var is needed. |
| 8 | **`ConvexError` payload** | String vs object | **Object `{ code, message }`** (typed `AppErrorData`): `message` is user-friendly and shown in toasts; `code` (`UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND`) lets tests and later UI branch without string matching. |

## Data Model

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { roleValidator } from "./lib/validators";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),        // identity.tokenIdentifier (issuer|subject)
    name: v.string(),                   // identity.name, fallback "Neighbor"
    email: v.optional(v.string()),      // identity.email (claim may be absent)
    role: roleValidator,                // "user" | "admin" — default "user"
    isTrustedLender: v.boolean(),       // default false; set by admin (later spec)
  }).index("by_token", ["tokenIdentifier"]),
});
```

```ts
// convex/lib/validators.ts
export const roleValidator = v.union(v.literal("user"), v.literal("admin"));
export type Role = Infer<typeof roleValidator>;
```

| Field | Written by | Notes |
|---|---|---|
| `tokenIdentifier` | `users.store` (insert only) | Unique per Clerk app + user; lookup via `by_token` + `.unique()` |
| `name`, `email` | `users.store` (insert + patch when changed) | Synced from session token claims; `email` optional because the claim can be missing (e.g. phone-only sign-up) |
| `role` | `users.store` insert (`"user"`), `users.setRole` (internal) | **No public function writes it after insert** |
| `isTrustedLender` | `users.store` insert (`false`) | Admin mutation comes with the Admin spec |

Indexes: only `by_token`. No `by_email` (email is not an identity key and nothing looks users up by email yet). Avoid `.filter` (coding standards).

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `convex/schema.ts` | create | `users` table + `by_token` index |
| `convex/lib/validators.ts` | create | `roleValidator`, `Role` type (shared with later specs) |
| `convex/lib/errors.ts` | create | `AppErrorCode`, `AppErrorData`, `unauthenticated()`, `forbidden()`, `notFound()` helpers that throw `ConvexError<AppErrorData>` |
| `convex/lib/auth.ts` | create | `getCurrentUser(ctx)`, `requireUser(ctx)`, `requireAdmin(ctx)`; `userByToken(ctx, tokenIdentifier)` (internal to the module) |
| `convex/users.ts` | create | `store` (public mutation), `current` (public query), `setRole` (internal mutation) |
| `convex/users.test.ts` | create | convex-test for `store`, `current`, `setRole` |
| `convex/lib/auth.test.ts` | create | convex-test for the helpers |
| `convex/whoami.ts`, `convex/whoami.test.ts` | **delete** | Replaced by `users.current` (Decision 6) |
| `src/hooks/useCurrentUser.ts` | create | `useConvexAuth()` + `useQuery(api.users.current)` → `{ isLoading, isAuthenticated, user }`; `isLoading` stays true while authenticated but row not yet stored |
| `src/components/auth/UserSync.tsx` | create | `'use client'`; renders `null`; when Convex `isAuthenticated` becomes true (or the Clerk `userId` changes) calls `users.store` once; on error `toast.error(getErrorMessage(err))` |
| `src/components/providers/ConvexClientProvider.tsx` | modify | Render `<UserSync />` inside `ConvexProviderWithClerk` |
| `src/components/auth/AuthStatus.tsx` | modify | Replace `IdentityProof` (`whoami`) with the stored user from `useCurrentUser` (name, email, role badge) |
| `src/lib/errors.ts` | create | `getErrorMessage(error: unknown): string` — `error instanceof ConvexError` → `error.data.message`, else generic message |
| `src/components/ui/sonner.tsx` | create (shadcn) | `npx shadcn add sonner` (package `sonner` already installed) |
| `src/app/layout.tsx` | modify | Mount `<Toaster />` |
| `context/project-overview.md` | modify | Data model draft: `users.clerkId` → `tokenIdentifier`; `email` optional |
| `context/coding-standards.md` | modify | convex-test example: seed the user via `users.store` before acting (see *Doc Conflicts*) |

### API shape (short snippets for clarity only)

`convex/lib/auth.ts`:

```ts
import type { QueryCtx } from "../_generated/server"; // MutationCtx extends QueryCtx's reader surface
import type { Doc } from "../_generated/dataModel";

export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user === null) unauthenticated("Please sign in to continue.");
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") forbidden("Only admins can do this.");
  return user;
}
```

- `requireUser` distinguishes "no identity" (`"Please sign in to continue."`) from "identity but no row yet" (`"Your account is still being set up. Please try again."`); both use code `UNAUTHENTICATED`.
- Throw helpers are typed `never` so TypeScript narrows after them.
- Queries that must work signed-out (e.g. `users.current`, the future public tool list) use `getCurrentUser` and return `null`/public data instead of throwing — a throwing reactive query breaks the render.

`convex/users.ts`:

```ts
export const store = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) unauthenticated("Please sign in to continue.");
    // lookup by_token → patch only name/email if changed → return _id
    // else insert { tokenIdentifier, name, email, role: "user", isTrustedLender: false }
  },
});

export const current = query({
  args: {},
  returns: v.union(v.null(), v.object({ _id: v.id("users"), name: v.string(),
    email: v.optional(v.string()), role: roleValidator, isTrustedLender: v.boolean() })),
  handler: async (ctx) => { /* getCurrentUser → projection (no tokenIdentifier) or null */ },
});

export const setRole = internalMutation({
  args: { userId: v.id("users"), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { userId, role }) => { /* notFound if missing; patch; console.log audit line */ },
});
```

Idempotency of `store`: Convex mutations are serializable transactions (OCC). Two concurrent `store` calls for the same identity (two tabs) conflict on the `by_token` read; one is retried and then sees the other's insert → still one row. `.unique()` would throw if duplicates ever existed, making a violation loud instead of silent.

Client error reading (Convex docs):

```ts
error instanceof ConvexError ? (error.data as AppErrorData).message : "Something went wrong. Please try again."
```

Only `ConvexError` data reaches the client in prod; other errors are redacted — never put internals in `message`.

## Authorization Rules Matrix

| Action | Visitor (signed out) | user | admin |
|---|---|---|---|
| `users.current` (query) | ✅ returns `null` | ✅ own row only (projection) | ✅ own row only |
| `users.store` (mutation) | ❌ `UNAUTHENTICATED` | ✅ creates/syncs **own** row; cannot set `role`/`isTrustedLender` (no args) | ✅ same; does not alter own role |
| `users.setRole` (internal) | ❌ not callable from clients | ❌ not callable from clients | ❌ not callable from clients — **operator only** (CLI / dashboard) |
| `requireUser(ctx)` | throws `UNAUTHENTICATED` | passes | passes |
| `requireAdmin(ctx)` | throws `UNAUTHENTICATED` | throws `FORBIDDEN` | passes |

**Rule for every later feature:**

- Public function that needs a signed-in user → first line `const me = await requireUser(ctx);`, then ownership checks against `me._id` (never a client-sent `userId` / `ownerId` / `role`).
- Admin-only function → `const admin = await requireAdmin(ctx);`.
- Public read that also serves visitors → `getCurrentUser(ctx)` (may be `null`), never return private fields to visitors.
- Internal functions (`internal.*`) receive trusted args from other server code and do not call these helpers.
- `role` / `isTrustedLender` are written only by `users.setRole` (internal) or a future admin mutation guarded by `requireAdmin`.

## Manual Steps (User)

### Before implementation

None. No new env vars, no Clerk change (the `name`/`email` claims already exist in both apps), no Convex dashboard change.

### After implementation — promote the first admin in DEV

1. With `npx convex dev` and `npm run dev` running, sign in on `http://localhost:3000` with the account that should be admin. The home shows your stored user with role `user`.
2. Convex Dashboard → project `lendloop` → **dev** deployment → *Data* → `users` → copy the row's `_id`.
3. Run (DEV — no `--prod`):

   ```bash
   npx convex run users:setRole '{"userId":"<_id>","role":"admin"}'
   ```

   (Or: dashboard → dev → *Functions* → `users:setRole` → *Run function*. Claude may run the CLI command for DEV if you ask.)
4. The home updates reactively to role `admin`.

### Later — promote the first admin in PROD (separate, explicitly confirmed step)

Only after this feature is merged and deployed, and only when you decide to:

1. Sign in on https://lendloop-tawny.vercel.app with the PROD admin account (creates the PROD row).
2. Convex Dashboard → **Production** (`enchanted-raven-234`) → *Data* → `users` → copy `_id`.
3. Preferred: dashboard → Production → *Functions* → `users:setRole` → *Run function* with `{ "userId": "<_id>", "role": "admin" }`.
   - If the dashboard does not offer internal functions, run `npx convex run --prod users:setRole '{...}'` **yourself**, or ask Claude explicitly — Claude never runs a `--prod` command without your explicit request and confirmation (`CLAUDE.md`).
4. Verify on the PROD site that the role shows `admin`.

## Implementation Steps (Claude)

All against **DEV**. Re-check APIs with Context7 / official docs while implementing.

1. Create branch `feature/schema-rbac` from `main`.
2. `convex/lib/validators.ts`, `convex/lib/errors.ts`, `convex/schema.ts`.
3. `convex/lib/auth.ts` (helpers).
4. `convex/users.ts` (`store`, `current`, `setRole`) with arg **and** return validators.
5. Delete `convex/whoami.ts` and `convex/whoami.test.ts` (Decision 6 — already announced in `setup.md` / `setup-production.md`).
6. Tests: `convex/users.test.ts`, `convex/lib/auth.test.ts` using `convexTest(schema, modules)`.
7. Let the running `npx convex dev` (started by the user) push the schema to the dev deployment; check for schema/push errors in its output.
8. `npx shadcn add sonner`; mount `<Toaster />` in `src/app/layout.tsx`.
9. `src/lib/errors.ts`, `src/hooks/useCurrentUser.ts`, `src/components/auth/UserSync.tsx`; mount `UserSync` in `ConvexClientProvider`.
10. Update `AuthStatus` to show the stored user + role via `useCurrentUser`.
11. Update docs: `context/project-overview.md` data model draft (`tokenIdentifier`, optional `email`); `context/coding-standards.md` convex-test example.
12. Run `npm run lint`, `npm run test:run`, `npm run build`; verify in the browser (see *Testing → Manual*). Guide the user through *Promote the first admin in DEV*.
13. Ask before committing. Before merging to `main`, go through *PROD Impact* with the user.

## PROD Impact

Merging to `main` triggers `npx convex deploy` to Convex prod:

- **Schema push:** a new `users` table on prod. Prod has no tables yet, so there is no schema-validation conflict and no migration.
- **Functions:** `whoami:get` disappears from prod; `users:store`, `users:current`, `users:setRole` appear. The deployed client is built in the same Vercel build, so no live client calls the removed `whoami`.
- **Existing PROD Clerk users** (the Phase 4 smoke-test account) get their `users` row on their next sign-in/page load — no backfill needed.
- **No new env vars** on Convex prod or Vercel; no Clerk "LendLoop Prod" change.
- **No admin exists in PROD** after the deploy. That is safe (nothing admin-only exists yet). Promotion is the separate confirmed step above.

Check before merging:

- [ ] `npm run build` / `lint` / `test:run` pass on the branch
- [ ] DEV verified in the browser (row created, no duplicates, role change reflected)
- [ ] User confirms the merge (pushing `main` = PROD deploy)
- [ ] After the Vercel deploy: PROD sign-in shows the stored user with role `user` (Convex Dashboard → Production → *Data* → `users` has one row per signed-in account) — read-only check done by the user, or by Claude only with explicit permission

Rollback: Vercel Instant Rollback restores the old Next.js build, but **not** Convex prod functions/schema — revert the commit on `main` instead. The old code has no schema, and a deploy without `schema.ts` is accepted with existing tables, so a revert is safe.

## Acceptance Criteria

- [ ] `convex/schema.ts` defines `users` with `tokenIdentifier`, `name`, `email?`, `role`, `isTrustedLender` and index `by_token`; `npx convex dev` pushes it without errors
- [ ] A new sign-in creates **exactly one** `users` row (`role: "user"`, `isTrustedLender: false`)
- [ ] Repeated sign-ins, page reloads and multiple tabs do **not** create duplicates
- [ ] Changing the name in Clerk ("LendLoop Dev") is reflected in the row after the next load; `role` / `isTrustedLender` are untouched by the sync
- [ ] Signed out: home loads, `users.current` returns `null`, no console/Convex errors
- [ ] Signed in: home shows name, email and role from `users.current` (replaces the `whoami` block)
- [ ] `requireUser` rejects unauthenticated callers; `requireAdmin` rejects non-admins with `FORBIDDEN`, both as `ConvexError` with a user-friendly message
- [ ] **No public function** accepts or writes `role` or `isTrustedLender`; `users.setRole` is `internalMutation`
- [ ] First DEV admin promoted via `npx convex run users:setRole` and reflected in the UI
- [ ] `convex/whoami.ts` / `whoami.test.ts` removed; no remaining references
- [ ] `npm run lint`, `npm run test:run`, `npm run build` pass
- [ ] No `--prod` command was run; no secrets in tracked files

## Testing

### Unit (convex-test)

Setup notes:

- With a schema: `convexTest(schema, modules)` with `const modules = import.meta.glob("./**/*.ts")` (in `convex/lib/auth.test.ts` use `import.meta.glob("../**/*.ts")` — glob paths are relative to the test file).
- `t.withIdentity({ subject, name, email })`: `convex-test@0.0.69` fills `issuer` (`https://convex.test`) and `tokenIdentifier` (`${issuer}|${subject}`) when omitted — confirmed in `node_modules/convex-test/dist/index.js`. Same `subject` ⇒ same `tokenIdentifier`.
- Internal functions are called directly: `t.mutation(internal.users.setRole, {...})`.
- Helpers are tested without test-only Convex functions: `t.withIdentity(...).run((ctx) => requireAdmin(ctx))` — `t.run` carries the accessor's identity (verified in the convex-test source: `auth: authStorage.getStore() ?? auth`).
- Seed users by calling `api.users.store` as that identity; seed an admin with `internal.users.setRole` (or `t.run` + `ctx.db.patch`).
- Assert error codes: `rejects.toThrow(ConvexError)` plus checking `(err as ConvexError<AppErrorData>).data.code`.
- No `vitest.config.ts` change: the global `edge-runtime` environment suffices because only Convex code is tested (the convex-test docs' `projects` split is for mixing in jsdom frontend tests).

`convex/users.test.ts`:

- `store` unauthenticated → `ConvexError` `UNAUTHENTICATED`, no row inserted
- `store` first call → one row with `role: "user"`, `isTrustedLender: false`, `name` / `email` from identity; returns its `_id`
- `store` called twice (and concurrently via `Promise.all`) → still one row, same `_id`
- `store` with changed `name` / `email` → row patched; `role` / `isTrustedLender` preserved (pre-set to `admin` / `true` via `t.run`)
- `store` with missing `name` claim → fallback name; missing `email` → field absent
- `store` with extra args (`{ role: "admin" }`, cast past TypeScript) → rejected by the args validator; row (if any) still `user`
- Two different subjects → two rows
- `current` unauthenticated → `null`; authenticated before `store` → `null`; after `store` → projection without `tokenIdentifier`
- `setRole` promotes and demotes; unknown `userId` (deleted row) → `NOT_FOUND`
- No public path to admin: assert `api.users` exposes only `store` and `current` (compile-time — `setRole` is only on `internal.users`), and the role stays `user` after every public call above

`convex/lib/auth.test.ts`:

- `getCurrentUser`: no identity → `null`; identity without row → `null`; with row → the doc
- `requireUser`: no identity → `UNAUTHENTICATED` ("Please sign in…"); identity without row → `UNAUTHENTICATED` ("still being set up"); with row → the doc
- `requireAdmin`: no identity → `UNAUTHENTICATED`; `user` → `FORBIDDEN`; `admin` → the doc

### Manual (browser, DEV)

1. Terminals: `npx convex dev` and `npm run dev`.
2. Signed out → home loads, sign-in button, no errors.
3. Sign in → stored user block (name, email, role `user`). Dashboard (dev) → *Data* → `users`: one row.
4. Reload several times and open a second tab → still one row.
5. Promote via `npx convex run users:setRole ...` → role updates to `admin` without reload.
6. Sign out → signed-out state; sign in with a second account → a second row with role `user`.

## Out of Scope

- **Tools** CRUD and the `tools` table → listings spec
- **Loans** flow and the `loans` table → loans spec
- **Admin** UI, "remove any listing", "view all loans", and the **Trusted Lender** mutation → admin spec (it will use `requireAdmin`)
- **Public page** UI (real tools list) → public page spec
- **n8n**, webhooks, HMAC, `automationLogs`, `convex/http.ts`
- Clerk webhooks / user deletion sync (Decision 1)
- Roles in Clerk `publicMetadata` / session claims (Decision 4)
- Protected pages with `auth.protect()` (added with the first authenticated page)
- Any PROD action beyond the automatic deploy on merge (PROD admin promotion is a later, user-confirmed step)

## Doc Conflicts

| Topic | Conflict | Followed |
|---|---|---|
| User identity field | `project-overview.md` draft uses `users.clerkId`; Convex guide (client-mutation approach) uses `tokenIdentifier` + `by_token`; Convex guide (webhook approach) uses `externalId` = `subject` | **Convex guide, client-mutation approach** (`tokenIdentifier`). Update the draft. |
| convex-test example in `coding-standards.md` | Example creates a tool right after `withIdentity` with no user row; with this spec, functions using `requireUser` need the row first | **This spec**: seed via `api.users.store` first. Update the example. |
| Role storage | Clerk "basic RBAC" guide stores roles in `publicMetadata` + session claim; project rules require enforcement in Convex | **Project rules** (Convex `users.role`) — Clerk's guide targets Next.js server checks, not a Convex backend. |
| Webhook vs client mutation | Convex guide presents both without an explicit recommendation | **Client mutation** — JWT already carries all needed fields (guide: webhooks are for "information not contained in the JWT"). |
| Custom functions | Convex best practices: plain TS helpers for most logic; custom functions (`convex-helpers`) "can be helpful" | **Plain helpers** (no extra dependency). |
| Vitest setup | convex-test docs show a `projects` split (Vitest 4) for edge-runtime + jsdom | **Keep current single edge-runtime config** — no component tests per `coding-standards.md`. |
| Running internal functions in the dashboard | CLI docs confirm `npx convex run` runs internal functions; the dashboard functions page does not state whether internal functions are listed | Dashboard first for PROD; CLI fallback run by the user (or Claude only on explicit request). Confirm in DEV during implementation. |

## References

- Convex — Storing users in the Convex database (client `store` mutation vs Clerk webhooks, `by_token` / `byExternalId`, `useStoreUserEffect`, `useCurrentUser`): https://docs.convex.dev/auth/database-auth
- Convex — Auth in functions (`getUserIdentity`, `tokenIdentifier` = subject + issuer, custom claims): https://docs.convex.dev/auth/functions-auth
- Convex — Best practices (access control on public functions, plain helpers vs custom functions, internal functions, validators, avoid `.filter`): https://docs.convex.dev/understanding/best-practices/
- Convex — Application errors (`ConvexError`, `error.data`, prod redaction): https://docs.convex.dev/functions/error-handling/application-errors
- Convex — convex-test (`convexTest(schema, modules)`, `withIdentity`, internal functions, `t.run`, Vitest config): https://docs.convex.dev/testing/convex-test
- Convex — CLI (`npx convex run` for public/internal functions, `--prod`): https://docs.convex.dev/cli
- Convex — Dashboard functions page (Run function, "Act as a user"): https://docs.convex.dev/dashboard/deployments/functions
- Convex — OCC and atomicity (serializable mutations): https://docs.convex.dev/database/advanced/occ
- convex-helpers — custom functions (`customQuery`, `customMutation`, `customCtx`): https://github.com/get-convex/convex-helpers (via Context7 `/get-convex/convex-helpers`, `server-customFunctions.md`)
- Clerk — Basic RBAC with metadata (alternative considered, Decision 4): https://clerk.com/docs/guides/secure/basic-rbac
- convex-test source (installed `0.0.69`): `node_modules/convex-test/dist/index.js` (`withIdentity` defaults; `run` carries identity)
- Project: `CLAUDE.md`, `context/project-overview.md`, `context/coding-standards.md`, `context/ai-interaction.md`, `context/features/setup.md`, `context/features/setup-production.md`
