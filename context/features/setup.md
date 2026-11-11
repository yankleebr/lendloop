# Setup — Next.js + Clerk + Convex (DEV)

## Overview

Wire Next.js, Clerk (app **"LendLoop Dev"**) and Convex (**dev deployment** of the existing project `lendloop`) together on `localhost`, and prove that a signed-in user's identity reaches a Convex function.

This is Phase 3 of the project setup and targets the **DEV environment only**. No schema, no roles, no real pages — just the plumbing and a minimal proof.

## Prerequisites

Already done by the user:

- Convex account with an existing project named **`lendloop`**
- Clerk applications **"LendLoop Dev"** and **"LendLoop Prod"** (both Development instances — see `CLAUDE.md` → *Environments*)
- Dependencies already installed (see `package.json`): `next@16.4`, `react@19.3`, `@clerk/nextjs@^7.9`, `convex@^1.49`, `convex-test`, `vitest`, `@edge-runtime/vm`
- `vitest.config.ts` already configured for `edge-runtime` with `convex-test` inlined
- `next.config.ts` has `cacheComponents: true` (affects Clerk components — see *Key Gotchas*)

## Requirements

- Link the repo to the existing Convex project `lendloop` (dev deployment); `.env.local` gets the Convex variables
- Activate the Clerk ↔ Convex integration in the **"LendLoop Dev"** Clerk app
- Add `convex/auth.config.ts` reading `CLERK_JWT_ISSUER_DOMAIN` from **Convex env vars** (DEV deployment)
- Providers in the App Router: `ClerkProvider` + `ConvexProviderWithClerk` (via a client component)
- `src/proxy.ts` with `clerkMiddleware()` — the public page (`/`) stays reachable while signed out
- A minimal authenticated proof: a Convex query using `ctx.auth.getUserIdentity()` rendered on the home page for signed-in users
- Keep `.env.example` in sync with the variables actually used

## Manual Steps (User)

Do these **before** Claude starts implementing. Never paste secrets into chat or into tracked files.

### 1. Link the repo to the existing Convex project (DEV)

1. In the project root, run `npx convex dev`.
2. Log in if prompted, then choose **existing project** → team → **`lendloop`**.
3. The CLI creates the `convex/` folder (with `_generated/`) and writes to `.env.local`:
   - `CONVEX_DEPLOYMENT` (the dev deployment name, e.g. `dev:some-name-123`)
   - `NEXT_PUBLIC_CONVEX_URL` (e.g. `https://some-name-123.convex.cloud`)
4. Leave `npx convex dev` running in its own terminal (it watches and pushes functions/schema).

> If `.env.local` already has a `CONVEX_DEPLOYMENT` pointing elsewhere, remove it first — `npx convex dev` only prompts to configure a new or existing project when `CONVEX_DEPLOYMENT` is unset.

### 2. Activate the Convex integration in Clerk ("LendLoop Dev" only)

1. Clerk Dashboard → select app **"LendLoop Dev"** (Development instance).
2. Open the **Convex integration** setup page (Dashboard → *Integrations* → *Convex*) → **Activate Convex integration**.
3. Copy the **Frontend API URL** shown (format `https://<verb-noun-00>.clerk.accounts.dev`). This is the issuer domain.
4. Dashboard → **API keys** → copy the **Publishable key** (`pk_test_...`) and **Secret key** (`sk_test_...`).

> No manual JWT template named `convex` is needed anymore — activating the integration configures the `aud: "convex"` claim on the session token (visible under *Sessions → Claims*).

### 3. Fill `.env.local` (Next.js, DEV)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
# CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL were written by `npx convex dev`
```

### 4. Set the issuer domain in Convex (DEV deployment)

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<verb-noun-00>.clerk.accounts.dev
```

(No `--prod` — the command targets the dev deployment by default. Can also be set in the Convex dashboard → dev deployment → *Settings → Environment Variables*.)

### 5. Restart

Restart `npm run dev` after editing `.env.local`. `npx convex dev` must re-sync after `convex/auth.config.ts` is created (it does so automatically while running).

## Implementation Steps (Claude)

Use Context7 / official docs to re-check APIs while implementing — `@clerk/nextjs` v7 (Core 3) changed several components.

1. Create `convex/auth.config.ts` (Clerk provider, `applicationID: "convex"`).
2. Create `convex/whoami.ts` with a public `query` that returns a minimal identity projection or `null`.
3. Create `convex/whoami.test.ts` (convex-test, see *Testing*).
4. Create `src/components/providers/ConvexClientProvider.tsx` (`'use client'`).
5. Update `src/app/layout.tsx`: `ClerkProvider` **inside `<body>`**, wrapping `ConvexClientProvider`; set real metadata title/description (LendLoop + tagline).
6. Create `src/proxy.ts` with `clerkMiddleware()` and the current recommended matcher.
7. Create `src/components/auth/AuthStatus.tsx` (`'use client'`): sign-in button when signed out, `UserButton` + identity proof when signed in.
8. Replace the create-next-app boilerplate in `src/app/page.tsx` with a minimal placeholder (LendLoop name + tagline) that renders `AuthStatus`. The real public page comes in a later spec.
9. Review `.env.example` (expected: no new names; see *Environment Variables*).
10. Run `npm run lint`, `npm run test:run`, `npm run build`; verify in the browser.

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `convex/auth.config.ts` | create | Declares Clerk as the auth provider for Convex |
| `convex/whoami.ts` | create | Temporary proof query: returns `{ subject, name, email }` from `ctx.auth.getUserIdentity()` or `null` |
| `convex/whoami.test.ts` | create | convex-test coverage for the proof query |
| `src/components/providers/ConvexClientProvider.tsx` | create | Client component creating `ConvexReactClient` and rendering `ConvexProviderWithClerk` |
| `src/app/layout.tsx` | modify | Mount `ClerkProvider` + `ConvexClientProvider`; LendLoop metadata |
| `src/proxy.ts` | create | `clerkMiddleware()` so Clerk auth state is available server-side; no route is blocked at this stage |
| `src/components/auth/AuthStatus.tsx` | create | Signed-out: `SignInButton`. Signed-in: `UserButton` + result of `api.whoami.get` |
| `src/app/page.tsx` | modify | Minimal placeholder (name, tagline, `AuthStatus`) replacing the boilerplate |
| `.env.example` | review | Already lists the right names; update only if something changes |

### API shape (short snippets for clarity only)

`convex/auth.config.ts`:

```ts
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    { domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" },
  ],
} satisfies AuthConfig;
```

Provider (client component):

```tsx
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
// <ConvexProviderWithClerk client={convex} useAuth={useAuth}>{children}</ConvexProviderWithClerk>
```

Layout order (Clerk v7 requires `ClerkProvider` inside `<body>`):

```tsx
<html>
  <body>
    <ClerkProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  </body>
</html>
```

`src/proxy.ts` — default export of `clerkMiddleware()` plus the matcher from Clerk's reference (skip `_next` + static files, always run for `/(api|trpc)(.*)` and `/__clerk/(.*)`).

## Key Gotchas

- **Next.js 16 naming:** the file is `src/proxy.ts` (same level as `src/app/`), not `middleware.ts`.
- **`createRouteMatcher()` is deprecated** in the current Clerk SDK (logs a runtime warning). Clerk now recommends **resource-based auth checks** instead of protecting routes in the proxy. Therefore this spec uses a bare `clerkMiddleware()` (all routes public at the proxy level) and relies on:
  - Convex functions checking `ctx.auth.getUserIdentity()` (the real security boundary, per `coding-standards.md`)
  - `await auth.protect()` inside protected **pages** (from `@clerk/nextjs/server`) — introduced when the first protected page exists (later spec)
- **Clerk v7 (Core 3) component changes:** `SignedIn` / `SignedOut` / `Protect` were replaced by `<Show when="signed-in" | "signed-out">`. For Convex-backed UI, use **Convex's** `<Authenticated>` / `<Unauthenticated>` / `<AuthLoading>` from `convex/react` instead — they wait until Convex has validated the token, so authenticated queries never fire too early. `SignInButton` and `UserButton` still come from `@clerk/nextjs`.
- **Client auth state:** use `useConvexAuth()` (not Clerk's `useAuth()`) when a component needs `isAuthenticated` / `isLoading` for Convex data.
- **`cacheComponents: true`:** Clerk's quickstart wraps auth-dependent UI in `<Suspense>`. Wrap `AuthStatus` in `<Suspense>` if the build complains about uncached/dynamic data outside a Suspense boundary.
- **Provider order:** `ClerkProvider` must wrap `ConvexClientProvider` (Convex reads Clerk's context).
- **`NEXT_PUBLIC_CONVEX_URL` missing** → the provider should throw a clear error at startup rather than failing silently.
- **`isAuthenticated` stays `false` after sign-in** → `auth.config.ts` was not synced (is `npx convex dev` running?) or `CLERK_JWT_ISSUER_DOMAIN` is missing/wrong on the dev deployment.
- **Proof query must not throw when signed out** — it returns `null`, so the public page never errors.
- **Return a minimal projection** from `whoami.get` (subject, name, email) — never the raw identity object/token claims.

## Environment Variables

| Name | Lives in | Set by |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` (DEV) | User (Clerk "LendLoop Dev" → API keys) |
| `CLERK_SECRET_KEY` | `.env.local` (DEV) | User (Clerk "LendLoop Dev" → API keys) |
| `CONVEX_DEPLOYMENT` | `.env.local` (DEV) | `npx convex dev` (automatic) |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` (DEV) | `npx convex dev` (automatic) |
| `CLERK_JWT_ISSUER_DOMAIN` | **Convex env vars** (dev deployment) | User: `npx convex env set CLERK_JWT_ISSUER_DOMAIN ...` |

- `CLERK_JWT_ISSUER_DOMAIN` must **never** go in `.env.local` or code (`CLAUDE.md` → *Secrets*).
- `.env.example` already lists exactly these names — no change expected.
- `CONVEX_DEPLOY_KEY` and PROD values are **out of scope** (Phase 4).

## Acceptance Criteria

- [ ] Repo linked to Convex project `lendloop` (dev deployment); `.env.local` has `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`
- [ ] `CLERK_JWT_ISSUER_DOMAIN` set on the Convex **dev** deployment (and nowhere in the repo)
- [ ] `npx convex dev` syncs `convex/auth.config.ts` without errors
- [ ] Signed out: `http://localhost:3000/` loads (no redirect), shows the sign-in button, no console/Convex errors
- [ ] Sign-in via Clerk ("LendLoop Dev") works on localhost and returns to `/`
- [ ] Signed in: the page shows `UserButton` and the identity returned by `api.whoami.get` (subject/name/email) — proving the token reached Convex
- [ ] Sign-out returns the page to the signed-out state
- [ ] No `createRouteMatcher`, `SignedIn`/`SignedOut` or other deprecated APIs used
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] `npm run build` passes
- [ ] No secrets in tracked files; no `--prod` command was run

## Testing

### Unit (convex-test) — `convex/whoami.test.ts`

- Unauthenticated call → `api.whoami.get` returns `null`
- `t.withIdentity({ subject: "user_alice", name: "Alice", email: "alice@example.com" })` → returns the projection with those values
- Returned object contains only the projected fields (no `tokenIdentifier`, `issuer`, etc.)

Notes:

- There is no `convex/schema.ts` yet — call `convexTest(undefined, modules)` (or `convexTest()` if module discovery works without the glob) with `const modules = import.meta.glob("./**/*.ts")`; confirm the exact signature against the installed `convex-test` version.
- `convex/_generated/` must exist (created by `npx convex dev`) for `api` imports to resolve.
- Clerk ↔ Convex token validation itself **cannot** be unit-tested (convex-test fakes identities); it is verified manually.

### Manual (browser, DEV)

1. Terminals: `npx convex dev` and `npm run dev`.
2. Open `http://localhost:3000` signed out → page loads, sign-in button visible.
3. Sign in with a test account → `UserButton` and the identity block appear.
4. Convex dashboard (dev) → *Logs* → `whoami:get` runs without errors.
5. Sign out → back to the signed-out state.

## Out of Scope

- **PROD**: Vercel project/env vars, `npx convex deploy`, `CONVEX_DEPLOY_KEY`, Clerk **"LendLoop Prod"** integration, any `--prod` command → Phase 4 / separate spec
- **Schema, `users` table, `requireUser` / `requireAdmin` helpers, roles/RBAC, Trusted Lender** → spec 2 (the temporary `whoami` query will be replaced/removed there)
- **Real UI**: public page with tools list, listings, loans, admin views
- **Protected pages** (`auth.protect()` usage) — added with the first authenticated page
- **n8n** workflows, webhooks, HMAC, HTTP actions
- Custom sign-in/sign-up pages (Clerk's hosted/modal flow is enough for now)

## Doc Conflicts and Decisions

| Topic | Conflict | Decision |
|---|---|---|
| Convex env var name for the issuer | Convex docs use `CLERK_JWT_ISSUER_DOMAIN`; Clerk's Convex guide uses `CLERK_FRONTEND_API_URL` | **`CLERK_JWT_ISSUER_DOMAIN`** — matches Convex docs and is already fixed in `CLAUDE.md` / `.env.example`. The name is arbitrary; only the value (Frontend API URL) matters. |
| Proxy file name | Convex's Clerk page still shows `middleware.ts` | **`src/proxy.ts`** — Clerk docs state `proxy.ts` for Next.js 16+, and `coding-standards.md` requires it |
| Route protection | `coding-standards.md` says "Route protection via `clerkMiddleware` in `src/proxy.ts`"; current Clerk reference deprecates `createRouteMatcher()` and recommends resource-based checks | **Bare `clerkMiddleware()`** in the proxy; protection in Convex functions + `auth.protect()` in pages. Consider updating the coding-standards line in a later chore. |
| Signed-in/out UI | Clerk v7 docs use `<Show when=...>`; Convex docs use `<Authenticated>/<Unauthenticated>` | **Convex components** for anything that loads Convex data (both docs agree on this for Convex apps) |
| JWT template `convex` | Older guides create a JWT template named `convex` | **Dashboard "Convex integration"** — current Clerk and Convex docs both use it |

## References

- Convex — Clerk integration: https://docs.convex.dev/auth/clerk
- Convex — Auth in functions: https://docs.convex.dev/auth/functions-auth
- Convex — CLI (`convex dev`, `convex env set`): https://docs.convex.dev/cli
- Convex — Next.js quickstart: https://docs.convex.dev/quickstart/nextjs
- Convex — convex-test: https://docs.convex.dev/testing/convex-test
- Clerk — Convex integration: https://clerk.com/docs/guides/development/integrations/databases/convex
- Clerk — Next.js quickstart (`proxy.ts`, `Show`, `ClerkProvider` placement): https://clerk.com/docs/nextjs/getting-started/quickstart
- Clerk — `clerkMiddleware()` reference (matcher, `createRouteMatcher` deprecation): https://clerk.com/docs/reference/nextjs/clerk-middleware
- Clerk — Protect content in Next.js (`auth.protect()`): https://clerk.com/docs/nextjs/guides/secure/protect-content
- Clerk — Core 3 upgrade guide (`SignedIn`/`SignedOut` → `Show`, `ClerkProvider` inside `<body>`): https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3
- Project rules: `CLAUDE.md`, `context/coding-standards.md`, `context/project-overview.md`
