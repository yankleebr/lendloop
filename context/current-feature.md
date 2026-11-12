# Current Feature: Loans — Requests, Approval and Return

## Status

In Progress

## Goals

- `loans` table (`toolId`, `borrowerId`, `lenderId`, `startDate`/`endDate` as inclusive `YYYY-MM-DD`, `status`, `decidedAt?`, `cancelledAt?`, `returnedAt?`, `closeReason?`) with 5 indexes (`by_tool_status_start`, `by_borrower`, `by_borrower_status`, `by_lender`, `by_status_end`), pushed to DEV
- Status machine `pending → approved | rejected | cancelled`, `approved → returned` in one table + `transitionLoan` (the only place that changes `status`); every invalid transition throws `CONFLICT`; final states are final
- `loans.request` rejects: signed out, own tool, inactive/unknown tool, bad/past/too-long (> 30 days)/too-far (> 180 days) dates, approved overlap, own open overlap, > 10 pending
- `approve` / `reject` / `markReturned` lender only; `cancel` borrower only (pending only); unrelated users and admins get `FORBIDDEN`; unknown loan → `NOT_FOUND`
- `approve` re-checks overlap and auto-rejects overlapping pending requests of the same tool (`closeReason: "period_taken"`) in the same transaction
- Queries `listMyRequests`, `listIncoming` (caller's loans only, counterpart as `publicUser`, tool name even if removed, `isOverdue`) and `bookedPeriods` (dates only, no user data); all take `today` as an argument
- Real availability: `getAvailability(ctx, tool, today)` = `on_loan` if an approved loan has `startDate <= today`; public board hides on-loan tools; `tools.listPublic` / `list` / `listMine` gain **optional** `today` (server UTC fallback)
- `deactivateTool`: blocked (`CONFLICT`) with an approved loan; otherwise pending requests → `rejected` + `tool_removed`
- Pure helpers `isOverdue` / `listOverdue` for the reminders spec; no scheduler call, no HTTP endpoint
- UI: "Request" dialog on `/tools` (native date inputs + booked periods), `/loans/requests` and `/loans/incoming` (both `await auth.protect()`), header nav links, status/overdue badges, loading/empty/error states, toasts, mobile width OK
- convex-test coverage (authorization, transitions, overlap, availability, deactivate, API surface) + pure tests (`dates`, transition matrix, `isOverdue`)
- No new npm dependency or shadcn component; no `.filter` on DB queries; all lists bounded; no `Date.now()` in queries; `lint`, `test:run`, `build` pass

## Notes

- Spec: `context/features/loans.md` (Decisions 1–11 are authoritative)
- Dates: ISO `YYYY-MM-DD` strings validated by pure `parseIsoDate` (regex + `Date.UTC` round-trip); no date-fns on the server. Event timestamps are epoch ms (mutations only)
- "Today": queries receive it from the client (`useToday()` local date, re-renders at midnight); `PublicToolListLoader` uses server UTC. Mutations use server UTC with −1 day tolerance for "not in the past"
- Only **approved** loans block periods; pending requests don't (auto-rejected on approve)
- `lenderId` denormalized from `tool.ownerId` (never drifts — `ownerId` is never patched); never accept `borrowerId` / `lenderId` from the client
- Concurrency relies on Convex OCC over the narrow `by_tool_status_start` range — no lock document
- New error code `CONFLICT` + `conflict()` in `convex/lib/errors.ts`; bad dates/caps stay `INVALID_ARGUMENT`
- Constants in `convex/lib/loanRules.ts` (client-safe): `MAX_LOAN_DAYS = 30`, `MAX_ADVANCE_DAYS = 180`, `MAX_PENDING_PER_BORROWER = 10`, `MAX_LOAN_LIST = 100`, `MAX_BOOKED_PERIODS = 50`
- Client display: `format(parseISO(d), "MMM d, yyyy")` — never `new Date("YYYY-MM-DD")`
- Tests: mock clock `vi.setSystemTime(new Date("2026-11-12T12:00:00Z"))`, pass `today: "2026-11-12"`
- Hooks for later specs: automation event point at `transitionLoan` + `loans.request`; `listOverdue` via `by_status_end`; admin reuses `toLoanItem` / `deactivateTool`
- PROD impact: additive schema (no migration); `today` must stay optional on `tools.*` so the old PROD frontend keeps working during deploy. Rollback must keep the `loans` table if PROD has rows
- After implementation: run **auth-auditor** on `convex/loans.ts`, `convex/lib/loans.ts`, `convex/lib/tools.ts`; update the data model draft in `context/project-overview.md`
- Out of scope: admin views, n8n/automation, notifications, cancelling approved loans, editing dates, calendar picker, pagination

## History

<!-- Keep this updated. Earliest to latest -->

- **2026-11-10** — Initial project setup: Next.js 16 (App Router, TypeScript, Tailwind v4, React Compiler), shadcn/ui (base-nova), dependencies for Convex, Clerk, Zod, Sonner, next-themes, date-fns, lucide-react; Vitest + convex-test configured
- **2026-11-11** — Setup (DEV): repo linked to Convex `lendloop` dev deployment; Clerk "LendLoop Dev" ↔ Convex integration (`convex/auth.config.ts`, `CLERK_JWT_ISSUER_DOMAIN` in Convex env); `ClerkProvider` + `ConvexProviderWithClerk`; bare `clerkMiddleware()` in `src/proxy.ts`; temporary `whoami.get` proof query with convex-test coverage; minimal placeholder home with `AuthStatus`. Clerk session token customized with `name`/`email` claims (must be replicated in "LendLoop Prod" in Phase 4). Also fixed the self-referencing `--font-sans` token.
- **2026-11-11** — Setup Production (PROD): Vercel project `lendloop` (https://lendloop-tawny.vercel.app) with build command `npx convex deploy --cmd 'npm run build'`; `CONVEX_DEPLOY_KEY` (`deployment:deploy` only) and "LendLoop Prod" Clerk keys in Vercel Production scope only; preview builds disabled (Ignored Build Step "Only build production"); Convex prod (`enchanted-raven-234`) `CLERK_JWT_ISSUER_DOMAIN` set; Clerk "LendLoop Prod" Convex integration activated and `name`/`email` claims replicated (resolves the Phase 3 note). Build log confirmed both `NEXT_PUBLIC_CONVEX_*` injected. PROD smoke test passed (email and Google sign-in, identity reaches Convex prod, DEV/PROD users separated). Docs: `CLAUDE.md` PROD configuration, `.env.example` comments. Pending: verify a non-`main` branch push is skipped by Vercel.
- **2026-11-11** — Schema + RBAC: `convex/schema.ts` with `users` (`tokenIdentifier`, `name`, `email?`, `role`, `isTrustedLender`, index `by_token`); `users.store` (public, idempotent name/email sync, never writes role), `users.current` (public projection), `users.setRole` (internal, operator-only); `convex/lib` helpers `getCurrentUser` / `requireUser` / `requireAdmin`, typed `ConvexError` payload (`UNAUTHENTICATED` / `FORBIDDEN` / `NOT_FOUND`), `roleValidator`. Client `UserSync`, `useCurrentUser`, `AuthStatus` with stored user + role, Sonner `<Toaster />`. Removed temporary `whoami`. 25 convex-test tests. DEV verified in browser (one row per account, no duplicates across reloads/tabs, name sync, first DEV admin promoted via `setRole`); the Convex dashboard lists internal functions, so PROD admin promotion/demotion can be done from *Functions → `users:setRole`*. auth-auditor: no critical/high findings. Carry-over for tools/loans specs: add a `publicUser` projection (`_id`, `name`) and never return raw `users` docs; email is display-only, never an auth key; actions must call internal queries/mutations instead of `requireUser`. PROD: Vercel deploy pushed the schema/functions; first PROD admin promoted by the user via dashboard *Functions → `users:setRole`* (production requires *Unlock Edits* before running a mutation) and reflected on the live site without reload.
- **2026-11-12** — Tools + Public Page: `tools` table (`ownerId`, `name`, `category`, `condition`, `description`, `isActive` soft delete; indexes `by_active_category`, `by_owner_active`); category/condition enums shared in `convex/lib/validators.ts`, text limits/caps in `convex/lib/toolRules.ts`, new `INVALID_ARGUMENT` error code, `publicUser` projection in `convex/lib/users.ts`. Functions: `tools.listPublic` (no auth; `_id`/name/category only), `tools.list` (category filter via index, owner as `publicUser`, `isMine`, `availability`), `tools.listMine`, owner-only `create`/`update`/`remove`; all lists bounded with `.take` (200 board / 100 own), no `.filter`. Extension points for loans/admin: `getAvailability` (always `"available"` for now) and `deactivateTool` in `convex/lib/tools.ts`. auth-auditor: no critical/high; applied M1 (max 100 active listings per owner in `create`), extra matrix tests, and the rule that every `(app)` page calls `await auth.protect()` (`coding-standards.md`). UI: `/` server-preloaded + reactive public list (`preloadQuery` needs `await connection()` under `cacheComponents`); `(app)` route group with `AppHeader`, `/tools` (All tools + category filter) and `/tools/mine` (create/edit dialog with Zod + shadcn `Field`, remove `AlertDialog`), protected with `auth.protect()` (no `createRouteMatcher`); toasts at top-center with centered text. 62 convex-test tests. DEV verified in browser with two accounts and at mobile width. Gotcha: Chrome auto-translate breaks React DOM updates (`removeChild` NotFoundError) — test with translation off.
