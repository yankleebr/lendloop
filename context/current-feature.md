# Current Feature: Tools + Public Page

## Status

In Progress

## Goals

Spec: `context/features/tools-public-page.md`

- `tools` table (`ownerId`, `name`, `category`, `condition`, `description`, `isActive`) with indexes `by_active_category` and `by_owner_active`, pushed to DEV
- Category / condition enums defined once in `convex/lib/validators.ts` and reused by schema, functions and the client form
- `tools.listPublic` (no auth) returns only `_id`, `name`, `category` of active, available tools
- `tools.list` (optional category filter via index) returns active tools with `owner: { _id, name }`, `isMine`, `availability`; `tools.listMine` returns only the caller's active tools
- `tools.create` / `update` / `remove` are owner-only: `ownerId` always from `requireUser`; `FORBIDDEN` for non-owners (admins included), `NOT_FOUND` for removed/unknown tools, `UNAUTHENTICATED` when signed out
- `remove` is a soft delete (`isActive: false`) through `deactivateTool`; removed tools disappear from every list
- Name 2–60 chars (trimmed), description ≤ 500 chars, enforced server-side (`INVALID_ARGUMENT`) and client-side (Zod)
- No `.filter` on DB queries; every list bounded with `.take` (200 board / 100 own)
- `/`: "LendLoop", tagline, server-rendered + reactive public list (`preloadQuery` inside `<Suspense>`), "Sign in to lend or borrow" (Clerk modal)
- `/tools` and `/tools/mine` protected with `auth.protect()` in the `(app)` route group; header navigation works
- Create/edit dialog, remove confirmation, success/error toasts; loading, empty and error states; usable at mobile width
- No removed Clerk `<SignedIn>` / `<SignedOut>`; no `createRouteMatcher`
- convex-test coverage per spec *Testing*; `npm run lint`, `npm run test:run`, `npm run build` pass
- auth-auditor: no critical/high findings

## Notes

- DEV only. Schema/functions reach Convex prod automatically on the next `main` push (additive `tools` table, no new env vars) — go through *PROD Impact* with the user before merging.
- Availability is derived via `getAvailability(ctx, tool)` (always `"available"` until the loans spec); deactivation goes through `deactivateTool(ctx, tool)` — both are extension points for loans/admin.
- `publicUser` projection (`_id`, `name`) in `convex/lib/users.ts`; never return raw `users` docs.
- Authenticated client queries pass `"skip"` until `useCurrentUser().user` is non-null.
- Forms: shadcn `Field` + `useState` + Zod (no RHF/TanStack Form). Create/edit via dialog on My listings (no extra routes).
- Use Convex `<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` for signed-in/out rendering.
- Exactly one `preloadQuery` on `/`; fallback to client `useQuery` if it misbehaves after 2–3 attempts.
- If `v.union(...array.map(v.literal))` doesn't infer the literal union with `convex@1.49`, write literals explicitly.
- shadcn components to add: `input textarea select field label dialog alert-dialog badge card skeleton`.
- Docs to update: `context/project-overview.md` (tools model, derived availability), `context/coding-standards.md` (route protection via `auth.protect()`).
- Out of scope: loans, admin actions, restore, pagination/search, n8n, images, Trusted Lender badge.
- Added after auth-auditor (M1): `tools.create` enforces at most `MAX_OWN_TOOLS` (100) active listings per owner, so one account can't flood the 200-item board and `listMine` stays complete.
- `preloadQuery` needs `await connection()` before it under `cacheComponents` (it uses `Math.random()` internally).

## History

<!-- Keep this updated. Earliest to latest -->

- **2026-11-10** — Initial project setup: Next.js 16 (App Router, TypeScript, Tailwind v4, React Compiler), shadcn/ui (base-nova), dependencies for Convex, Clerk, Zod, Sonner, next-themes, date-fns, lucide-react; Vitest + convex-test configured
- **2026-11-11** — Setup (DEV): repo linked to Convex `lendloop` dev deployment; Clerk "LendLoop Dev" ↔ Convex integration (`convex/auth.config.ts`, `CLERK_JWT_ISSUER_DOMAIN` in Convex env); `ClerkProvider` + `ConvexProviderWithClerk`; bare `clerkMiddleware()` in `src/proxy.ts`; temporary `whoami.get` proof query with convex-test coverage; minimal placeholder home with `AuthStatus`. Clerk session token customized with `name`/`email` claims (must be replicated in "LendLoop Prod" in Phase 4). Also fixed the self-referencing `--font-sans` token.
- **2026-11-11** — Setup Production (PROD): Vercel project `lendloop` (https://lendloop-tawny.vercel.app) with build command `npx convex deploy --cmd 'npm run build'`; `CONVEX_DEPLOY_KEY` (`deployment:deploy` only) and "LendLoop Prod" Clerk keys in Vercel Production scope only; preview builds disabled (Ignored Build Step "Only build production"); Convex prod (`enchanted-raven-234`) `CLERK_JWT_ISSUER_DOMAIN` set; Clerk "LendLoop Prod" Convex integration activated and `name`/`email` claims replicated (resolves the Phase 3 note). Build log confirmed both `NEXT_PUBLIC_CONVEX_*` injected. PROD smoke test passed (email and Google sign-in, identity reaches Convex prod, DEV/PROD users separated). Docs: `CLAUDE.md` PROD configuration, `.env.example` comments. Pending: verify a non-`main` branch push is skipped by Vercel.
- **2026-11-11** — Schema + RBAC: `convex/schema.ts` with `users` (`tokenIdentifier`, `name`, `email?`, `role`, `isTrustedLender`, index `by_token`); `users.store` (public, idempotent name/email sync, never writes role), `users.current` (public projection), `users.setRole` (internal, operator-only); `convex/lib` helpers `getCurrentUser` / `requireUser` / `requireAdmin`, typed `ConvexError` payload (`UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND`), `roleValidator`. Client `UserSync`, `useCurrentUser`, `AuthStatus` with stored user + role, Sonner `<Toaster />`. Removed temporary `whoami`. 25 convex-test tests. DEV verified in browser (one row per account, no duplicates across reloads/tabs, name sync, first DEV admin promoted via `setRole`); the Convex dashboard lists internal functions, so PROD admin promotion/demotion can be done from *Functions → `users:setRole`*. auth-auditor: no critical/high findings. Carry-over for tools/loans specs: add a `publicUser` projection (`_id`, `name`) and never return raw `users` docs; email is display-only, never an auth key; actions must call internal queries/mutations instead of `requireUser`. PROD: Vercel deploy pushed the schema/functions; first PROD admin promoted by the user via dashboard *Functions → `users:setRole`* (production requires *Unlock Edits* before running a mutation) and reflected on the live site without reload.
