# Current Feature: Schema + RBAC

## Status

In Progress

## Goals

- `convex/schema.ts` with the `users` table (`tokenIdentifier`, `name`, `email?`, `role`, `isTrustedLender`) and index `by_token`; pushed to DEV by `npx convex dev` without errors
- Every signed-in Clerk user gets **exactly one** `users` row (`role: "user"`, `isTrustedLender: false`); reloads, repeated sign-ins and multiple tabs create no duplicates
- Public mutation `users.store` (no args): inserts on first call, patches only `name` / `email` when changed, never touches `role` / `isTrustedLender`; idempotent
- Public query `users.current`: minimal projection (no `tokenIdentifier`) or `null` when signed out / not yet stored
- Internal mutation `users.setRole` for admin provisioning (CLI / dashboard only); **no public function** accepts or writes `role` / `isTrustedLender`
- `convex/lib/auth.ts` helpers `getCurrentUser`, `requireUser`, `requireAdmin`; `convex/lib/errors.ts` with `ConvexError<{ code, message }>` (`UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND`); `convex/lib/validators.ts` with `roleValidator`
- Client: `UserSync` (inside the Convex provider) calls `users.store` after Convex auth; `useCurrentUser` hook; `AuthStatus` shows stored name, email and role; errors shown via Sonner toast (`<Toaster />` mounted)
- `convex/whoami.ts` / `whoami.test.ts` removed with no remaining references
- convex-test coverage in `convex/users.test.ts` and `convex/lib/auth.test.ts` using `convexTest(schema, modules)`
- Docs updated: `project-overview.md` data model (`tokenIdentifier`, optional `email`), `coding-standards.md` convex-test example (seed via `api.users.store`)
- First DEV admin promoted via `npx convex run users:setRole` and reflected reactively in the UI
- `npm run lint`, `npm run test:run`, `npm run build` pass; no `--prod` command run; no secrets in tracked files

## Notes

- Spec: `context/features/schema-rbac.md`. Targets **DEV**; schema/functions reach Convex prod automatically on the next `main` push (see spec → *PROD Impact*). PROD admin promotion is a separate, user-confirmed step — Claude never runs `--prod`.
- Key decisions: client `store` mutation (no Clerk webhooks); identity key `tokenIdentifier` (replaces draft `clerkId`); plain helpers (no `convex-helpers`); roles live in Convex, not Clerk metadata; schema has `users` only; `whoami` removed.
- `requireUser` distinguishes "no identity" ("Please sign in to continue.") from "identity but no row" ("Your account is still being set up. Please try again."), both `UNAUTHENTICATED`. Throw helpers typed `never`.
- Queries that must work signed-out use `getCurrentUser` and return `null` instead of throwing.
- convex-test `withIdentity` fills `issuer` / `tokenIdentifier` when omitted; `t.run` carries the identity — helpers tested via `t.withIdentity(...).run(ctx => requireAdmin(ctx))`. In `convex/lib/auth.test.ts` use `import.meta.glob("../**/*.ts")`. No `vitest.config.ts` change.
- `useCurrentUser.isLoading` stays true while authenticated but the row is not yet stored.
- Confirmed in DEV: the dashboard *Functions* page lists internal functions (`users:setRole` shown with a lock icon) → PROD admin promotion can be done from the dashboard.
- No manual steps before implementation (no env vars, no Clerk change). After: user promotes the first DEV admin.
- Implementation notes: `AppErrorData` is a `type` alias (interfaces fail Convex's `Value` constraint); "setRole not public" is a compile-time `@ts-expect-error` check (`api` is a runtime Proxy); `userByToken` is exported from `lib/auth.ts` for `users.store`.
- DEV verified: schema/functions pushed (`npx convex dev --once`); signed-out home OK with no console errors; Google sign-in created exactly one `users` row (`role: "user"`); first DEV admin promoted via `npx convex run users:setRole` and reflected without reload; reloads + second tab kept a single row; second account created a second row (`role: "user"`, fallback name "Neighbor" when Clerk has no name); changing the name in Clerk synced on reload with `role` / `isTrustedLender` untouched; lint, tsc, 25 tests and build pass.
- auth-auditor review: no critical/high findings. Applied: M1 (store "concurrency" test renamed — convex-test serializes mutations; real race safety relies on OCC, verified manually), L1 (issuer-binding test), L2 (demotion takes effect immediately). Deferred to the tools/loans specs: a `publicUser` projection helper (only `_id`, `name`) — never return a raw `users` doc from functions other than `users.current`; email is display-only, never an authorization key; actions cannot use `requireUser` directly (call an internal query/mutation).

## History

<!-- Keep this updated. Earliest to latest -->

- **2026-11-10** — Initial project setup: Next.js 16 (App Router, TypeScript, Tailwind v4, React Compiler), shadcn/ui (base-nova), dependencies for Convex, Clerk, Zod, Sonner, next-themes, date-fns, lucide-react; Vitest + convex-test configured
- **2026-11-11** — Setup (DEV): repo linked to Convex `lendloop` dev deployment; Clerk "LendLoop Dev" ↔ Convex integration (`convex/auth.config.ts`, `CLERK_JWT_ISSUER_DOMAIN` in Convex env); `ClerkProvider` + `ConvexProviderWithClerk`; bare `clerkMiddleware()` in `src/proxy.ts`; temporary `whoami.get` proof query with convex-test coverage; minimal placeholder home with `AuthStatus`. Clerk session token customized with `name`/`email` claims (must be replicated in "LendLoop Prod" in Phase 4). Also fixed the self-referencing `--font-sans` token.
- **2026-11-11** — Setup Production (PROD): Vercel project `lendloop` (https://lendloop-tawny.vercel.app) with build command `npx convex deploy --cmd 'npm run build'`; `CONVEX_DEPLOY_KEY` (`deployment:deploy` only) and "LendLoop Prod" Clerk keys in Vercel Production scope only; preview builds disabled (Ignored Build Step "Only build production"); Convex prod (`enchanted-raven-234`) `CLERK_JWT_ISSUER_DOMAIN` set; Clerk "LendLoop Prod" Convex integration activated and `name`/`email` claims replicated (resolves the Phase 3 note). Build log confirmed both `NEXT_PUBLIC_CONVEX_*` injected. PROD smoke test passed (email and Google sign-in, identity reaches Convex prod, DEV/PROD users separated). Docs: `CLAUDE.md` PROD configuration, `.env.example` comments. Pending: verify a non-`main` branch push is skipped by Vercel.
