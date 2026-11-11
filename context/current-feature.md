# Current Feature: Setup Production (Vercel + Convex prod + Clerk "LendLoop Prod")

## Status

In Progress

## Goals

- LendLoop deployed to Vercel on a `*.vercel.app` URL (no custom domain), build command `npx convex deploy --cmd 'npm run build'`
- Clerk "LendLoop Prod" configured exactly like "LendLoop Dev": Convex integration activated + same `name` / `email` session token claims
- Convex **prod** deployment has `CLERK_JWT_ISSUER_DOMAIN` = "LendLoop Prod" Frontend API URL
- Vercel env vars (`CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) exist only in **Production** scope; `NEXT_PUBLIC_CONVEX_*` and `CONVEX_DEPLOYMENT` are **not** set in Vercel (injected by `npx convex deploy`)
- Preview builds disabled (Ignored Build Step → "Only build production"); non-`main` pushes do not produce failed builds
- PROD smoke test passes: signed-out page loads; sign-in via "LendLoop Prod"; `whoami.get` identity (subject/name/email) shown; Convex prod logs show `whoami:get`; WebSocket targets the prod `*.convex.cloud` host
- DEV and PROD fully separated (different Convex deployments, different Clerk users/subjects)
- `CLAUDE.md` (Environments) and `.env.example` (comments) updated; "must be replicated in Prod" note resolved
- Merge to `main` triggers a successful Vercel production deploy that pushes to Convex prod
- `npm run lint`, `npm run test:run`, `npm run build` pass; no secrets in tracked files or chat

## Notes

- Spec: `context/features/setup-production.md` (Phase 4, mirrors Phase 3 `setup.md` on the PROD side)
- Most work is **manual dashboard steps by the user** (Clerk → Convex → Vercel, in that order). Claude's part: docs, local verification, build-log review, smoke test
- **PROD safety:** every PROD-touching action needs explicit user confirmation immediately before it. Claude never runs `npx convex deploy`, any `--prod` Convex command, Convex MCP with prod flags, or the `vercel` CLI unless explicitly asked
- Never request, echo or store `CONVEX_DEPLOY_KEY`, `CLERK_SECRET_KEY` or any `sk_` value
- `CLERK_JWT_ISSUER_DOMAIN` must exist on Convex prod **before** the first Vercel deploy (push fails otherwise)
- Do not generate a Convex Preview deploy key; `CONVEX_DEPLOY_KEY` is Production-scope only
- No code changes in `src/proxy.ts`, providers or `convex/auth.config.ts`; no `vercel.json`
- Keep `convex/whoami.ts`, `whoami.test.ts`, `AuthStatus.tsx` unchanged (PROD smoke test proof; removed in spec 2)
- Verify in the first build log that both `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` are injected (CLI source `convex@1.49`)
- Clerk Development instance on `*.vercel.app` is accepted (100-user cap, "Development mode" badge)
- Rollback: Vercel Instant Rollback (does not revert Convex prod functions — revert commit on `main` for that)
- Out of scope: custom domain / Clerk Production instance, preview environments, schema/RBAC, UI pages, n8n PROD, any change to DEV

## History

<!-- Keep this updated. Earliest to latest -->

- **2026-11-10** — Initial project setup: Next.js 16 (App Router, TypeScript, Tailwind v4, React Compiler), shadcn/ui (base-nova), dependencies for Convex, Clerk, Zod, Sonner, next-themes, date-fns, lucide-react; Vitest + convex-test configured
- **2026-11-11** — Setup (DEV): repo linked to Convex `lendloop` dev deployment; Clerk "LendLoop Dev" ↔ Convex integration (`convex/auth.config.ts`, `CLERK_JWT_ISSUER_DOMAIN` in Convex env); `ClerkProvider` + `ConvexProviderWithClerk`; bare `clerkMiddleware()` in `src/proxy.ts`; temporary `whoami.get` proof query with convex-test coverage; minimal placeholder home with `AuthStatus`. Clerk session token customized with `name`/`email` claims (must be replicated in "LendLoop Prod" in Phase 4). Also fixed the self-referencing `--font-sans` token.
