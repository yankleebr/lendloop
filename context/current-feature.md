# Current Feature

## Status

Not Started

## Goals

<!-- Bullet points of what success looks like -->

## Notes

<!-- Additional context, constraints, or details from spec -->

## History

<!-- Keep this updated. Earliest to latest -->

- **2026-11-10** — Initial project setup: Next.js 16 (App Router, TypeScript, Tailwind v4, React Compiler), shadcn/ui (base-nova), dependencies for Convex, Clerk, Zod, Sonner, next-themes, date-fns, lucide-react; Vitest + convex-test configured
- **2026-11-11** — Setup (DEV): repo linked to Convex `lendloop` dev deployment; Clerk "LendLoop Dev" ↔ Convex integration (`convex/auth.config.ts`, `CLERK_JWT_ISSUER_DOMAIN` in Convex env); `ClerkProvider` + `ConvexProviderWithClerk`; bare `clerkMiddleware()` in `src/proxy.ts`; temporary `whoami.get` proof query with convex-test coverage; minimal placeholder home with `AuthStatus`. Clerk session token customized with `name`/`email` claims (must be replicated in "LendLoop Prod" in Phase 4). Also fixed the self-referencing `--font-sans` token.
- **2026-11-11** — Setup Production (PROD): Vercel project `lendloop` (https://lendloop-tawny.vercel.app) with build command `npx convex deploy --cmd 'npm run build'`; `CONVEX_DEPLOY_KEY` (`deployment:deploy` only) and "LendLoop Prod" Clerk keys in Vercel Production scope only; preview builds disabled (Ignored Build Step "Only build production"); Convex prod (`enchanted-raven-234`) `CLERK_JWT_ISSUER_DOMAIN` set; Clerk "LendLoop Prod" Convex integration activated and `name`/`email` claims replicated (resolves the Phase 3 note). Build log confirmed both `NEXT_PUBLIC_CONVEX_*` injected. PROD smoke test passed (email and Google sign-in, identity reaches Convex prod, DEV/PROD users separated). Docs: `CLAUDE.md` PROD configuration, `.env.example` comments. Pending: verify a non-`main` branch push is skipped by Vercel.
