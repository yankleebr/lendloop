# Current Feature: Setup — Next.js + Clerk + Convex (DEV)

## Status

In Progress

## Goals

- Repo linked to the existing Convex project `lendloop` (dev deployment); `.env.local` has `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`
- Clerk ↔ Convex integration active in the "LendLoop Dev" Clerk app; `CLERK_JWT_ISSUER_DOMAIN` set on the Convex **dev** deployment only
- `convex/auth.config.ts` declares Clerk as provider (`applicationID: "convex"`) and syncs without errors
- `ClerkProvider` (inside `<body>`) wraps `ConvexClientProvider` (`ConvexProviderWithClerk`) in `src/app/layout.tsx`; LendLoop metadata set
- `src/proxy.ts` with a bare `clerkMiddleware()` and Clerk's recommended matcher; `/` reachable while signed out
- Temporary proof query `api.whoami.get` returns `{ subject, name, email }` or `null` (never throws, never returns raw claims)
- `AuthStatus` component: signed out → `SignInButton`; signed in → `UserButton` + identity from `api.whoami.get` (using Convex `<Authenticated>`/`<Unauthenticated>`/`<AuthLoading>`)
- `src/app/page.tsx` boilerplate replaced with a minimal placeholder (name, tagline, `AuthStatus`)
- convex-test coverage in `convex/whoami.test.ts` (unauthenticated → `null`; with identity → projection; only projected fields)
- Sign-in / sign-out flow works on `localhost:3000`
- `npm run lint`, `npm run test:run`, `npm run build` pass
- No deprecated APIs (`createRouteMatcher`, `SignedIn`/`SignedOut`), no secrets in tracked files, no `--prod` commands

## Notes

- Spec: `context/features/setup.md`. DEV environment only — PROD (Vercel, `npx convex deploy`, Clerk "LendLoop Prod") is out of scope.
- Manual steps by the user must be done first: `npx convex dev` linking, Clerk Convex integration activation, Clerk keys in `.env.local`, `npx convex env set CLERK_JWT_ISSUER_DOMAIN ...`.
- Next.js 16: proxy file is `src/proxy.ts`, not `middleware.ts`.
- Clerk v7 (Core 3): `ClerkProvider` goes inside `<body>`; `SignedIn`/`SignedOut` replaced by `<Show>`, but use Convex's auth components for Convex-backed UI; use `useConvexAuth()` for client auth state.
- `createRouteMatcher()` is deprecated → bare `clerkMiddleware()`; real protection lives in Convex functions (and `auth.protect()` in pages, later spec).
- `cacheComponents: true` → wrap `AuthStatus` in `<Suspense>` if the build complains.
- `ConvexClientProvider` must throw a clear error if `NEXT_PUBLIC_CONVEX_URL` is missing.
- No `convex/schema.ts` yet → `convexTest(undefined, modules)` with `import.meta.glob("./**/*.ts")`; verify signature against the installed `convex-test`.
- Re-check `@clerk/nextjs` v7 and Convex APIs via Context7 / official docs while implementing.
- Out of scope: schema, `users` table, RBAC helpers, real UI, protected pages, n8n, custom sign-in pages. `whoami` will be replaced in spec 2.

## History

<!-- Keep this updated. Earliest to latest -->

- **2026-11-10** — Initial project setup: Next.js 16 (App Router, TypeScript, Tailwind v4, React Compiler), shadcn/ui (base-nova), dependencies for Convex, Clerk, Zod, Sonner, next-themes, date-fns, lucide-react; Vitest + convex-test configured
