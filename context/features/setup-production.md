# Setup Production — Vercel + Convex prod + Clerk "LendLoop Prod" (PROD)

## Overview

Deploy LendLoop to Vercel on a `*.vercel.app` URL (no custom domain), backed by the Convex **production** deployment of project `lendloop` and the Clerk app **"LendLoop Prod"** (Development instance), and prove that a signed-in user's identity reaches the Convex **prod** deployment.

This is Phase 4 of the project setup. It mirrors Phase 3 (`context/features/setup.md`) on the PROD side. DEV and PROD stay fully separated: different Convex deployments (separate data), different Clerk apps (separate users).

After this feature, the deploy flow is: **merge to `main` → Vercel builds → `npx convex deploy` pushes functions/schema to Convex prod → Next.js build → Vercel serves the new version.**

Almost every step here touches PROD. Most of the work is **manual dashboard steps by the user**. Claude's part is small: documentation updates, local verification and the smoke test, each PROD action only after explicit confirmation (see *PROD Safety*).

## Prerequisites

Already done (Phase 3, see `context/current-feature.md` → *History*):

- Repo linked to Convex project **`lendloop`** (dev deployment); `.env.local` has `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, and the "LendLoop Dev" Clerk keys
- `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN` from Convex env vars (`applicationID: "convex"`)
- `ClerkProvider` → `ConvexClientProvider` (`ConvexProviderWithClerk`) in `src/app/layout.tsx`
- Bare `clerkMiddleware()` in `src/proxy.ts`
- Temporary proof query `convex/whoami.ts` (+ `whoami.test.ts`) rendered by `src/components/auth/AuthStatus.tsx`
- Clerk "LendLoop Dev": Convex integration activated **and** session token customized with `name` / `email` claims
- Clerk app **"LendLoop Prod"** exists (Development instance) but is **not configured yet**
- GitHub repo `github.com/yankleebr/lendloop` with `main` up to date
- Accounts: Vercel (Hobby is enough), Convex, Clerk

## Requirements

- Vercel project imported from `github.com/yankleebr/lendloop`, framework **Next.js**, build command `npx convex deploy --cmd 'npm run build'`
- `CONVEX_DEPLOY_KEY` (Convex **production** deploy key) stored only in Vercel, scoped to **Production** only
- Clerk "LendLoop Prod" configured exactly like "LendLoop Dev": Convex integration activated + the same session token claims (`name`, `email`)
- `CLERK_JWT_ISSUER_DOMAIN` on the Convex **prod** deployment = "LendLoop Prod" Frontend API URL
- Clerk "LendLoop Prod" keys in Vercel (Production scope)
- `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL` are **not** set in Vercel — `npx convex deploy` injects them into the build (see *How the Convex URLs reach the build*)
- Preview deployments disabled via Vercel **Ignored Build Step → "Only build production"** (see *Decisions*)
- No code change in `src/proxy.ts`, providers or `convex/auth.config.ts` (see *DEV vs PROD code*)
- Docs updated: `CLAUDE.md` (Environments) and `.env.example` (comments)

## How the Convex URLs reach the build

Verified in the official Convex Vercel guide and in the installed CLI source (`node_modules/convex/dist/cjs/cli/lib/deploy2.js` → `runCommand`, `envvars.js` → `suggestedEnvVarNames`, `convex@1.49`):

1. Vercel runs `npx convex deploy --cmd 'npm run build'` with `CONVEX_DEPLOY_KEY` in the environment.
2. The key selects the deployment (prod key → the `lendloop` **production** deployment). Functions, schema and `auth.config.ts` are pushed.
3. The CLI detects Next.js (`next` in `package.json`) and runs `npm run build` with **both** variables set to the prod deployment's canonical URLs:
   - `NEXT_PUBLIC_CONVEX_URL` → `https://<prod-name>.convex.cloud`
   - `NEXT_PUBLIC_CONVEX_SITE_URL` → `https://<prod-name>.convex.site`
4. Next.js inlines the `NEXT_PUBLIC_*` values into the client bundle.

Consequences:

- **Do not** add `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` or `CONVEX_DEPLOYMENT` to Vercel. (Injected values override them anyway, but a stale manual value would be confusing.)
- `--cmd-url-env-var-name` is **not** needed — the default for Next.js is already `NEXT_PUBLIC_CONVEX_URL`. The site-URL name has no flag; it is always inferred.
- If Convex push fails, `npm run build` never runs → the Vercel build fails and the previous deployment keeps serving (safe by default).

## Manual Steps (User)

Do these in order. **Never paste secrets (deploy key, `sk_test_...`) into chat or tracked files** — copy them straight from one dashboard to the other. Tell Claude when each block is done.

### 1. Clerk — configure "LendLoop Prod" (replicate DEV)

1. Clerk Dashboard → switch to app **"LendLoop Prod"** (Development instance). Double-check the app name in the top-left before every change.
2. Open the **Convex integration** setup page (`https://dashboard.clerk.com/apps/setup/convex`, with "LendLoop Prod" selected) → **Activate Convex integration**.
3. Copy the **Frontend API URL** shown (`https://<verb-noun-00>.clerk.accounts.dev`). It must be **different** from the "LendLoop Dev" one.
4. **Sessions → Customize session token → Claims**: the `aud: "convex"` claim is pre-mapped by the integration. Add the **same** `name` / `email` claims used in "LendLoop Dev" — open "LendLoop Dev" → Sessions in another tab and copy the JSON exactly (same keys, same shortcodes). Save.
5. **API keys** → keep this tab open for step 3 (Publishable key `pk_test_...`, Secret key `sk_test_...`).
6. Sign-in methods: confirm they match "LendLoop Dev" (e.g. email + Google) so the PROD sign-in looks the same.

### 2. Convex — prod deployment env var + deploy key

1. Convex Dashboard → project **`lendloop`** → switch the deployment selector to **Production**.
2. **Settings → Environment Variables** → add `CLERK_JWT_ISSUER_DOMAIN` = the "LendLoop Prod" Frontend API URL from step 1.3 (no trailing slash). Save.
   - This **must** exist before the first deploy: `auth.config.ts` reads it during the push, and the push fails if it is missing.
   - Alternative (only if the user prefers): Claude runs `npx convex env set --prod CLERK_JWT_ISSUER_DOMAIN <url>` after explicit confirmation. Dashboard is preferred.
3. Same prod deployment → **Settings → General** (URL & Deploy Key section) → **Generate Production Deploy Key** (permission `deployment:deploy`). Copy it — it is shown once. Do **not** generate a Preview deploy key (see *Decisions*).

### 3. Vercel — import and configure the project

1. Vercel Dashboard → **Add New… → Project** → import `yankleebr/lendloop` from GitHub (authorize the Vercel GitHub app for this repo if asked).
2. **Project name**: e.g. `lendloop` (becomes `lendloop.vercel.app` if free; any `*.vercel.app` name is fine).
3. **Framework Preset**: Next.js. **Root Directory**: `./`.
4. **Build and Output Settings** → override **Build Command**: `npx convex deploy --cmd 'npm run build'`. Leave Install/Output commands at default.
5. **Environment Variables** — add each, then set the environment scope to **Production only** (uncheck Preview and Development):

   | Name | Value from | Scope |
   |---|---|---|
   | `CONVEX_DEPLOY_KEY` | Convex prod deploy key (step 2.3) — mark as **Sensitive** | Production |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | "LendLoop Prod" `pk_test_...` | Production |
   | `CLERK_SECRET_KEY` | "LendLoop Prod" `sk_test_...` — mark as **Sensitive** | Production |

   If the import screen does not offer per-environment scoping, add them there and fix the scope afterwards in **Settings → Environment Variables**.
6. Click **Deploy**. This is the **first prod deploy** (Convex prod gets the functions; Next.js is built against the prod URL).
7. After it succeeds: **Settings → Build and Deployment → Ignored Build Step** → **"Only build production"**. Save.
8. Note the production URL (`https://<project>.vercel.app`) and send it to Claude for the smoke test.

### 4. Clerk — allowed origins / redirects

No action expected: Clerk Development instances accept any origin and use the Account Portal on `*.accounts.dev`, with the dev-browser token sent via querystring (`__clerk_db_jwt`). Only if sign-in fails with an origin/redirect error, check "LendLoop Prod" → *Domains / Paths* and report the exact error to Claude (see *Troubleshooting*).

## Implementation Steps (Claude)

Every step marked **[PROD]** requires asking the user and getting an explicit "yes" **immediately before** doing it — approval for one step does not cover the next.

1. Create the branch `feature/setup-production` (from `main`).
2. Read-only check of the local state: `npm run lint`, `npm run test:run`, `npm run build` pass on the branch (DEV values).
3. Guide the user through *Manual Steps* 1–3, one block at a time; never ask for secret values.
4. **[PROD, read-only, ask first]** After step 2.2: confirm `CLERK_JWT_ISSUER_DOMAIN` exists on the prod deployment — preferably by asking the user to check the dashboard; `npx convex env list --prod` / Convex MCP with prod access only if the user explicitly authorizes it.
5. After the first Vercel deploy: read the build log summary with the user (Convex push target must be the **prod** deployment, and the log must show `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` being set).
6. **[PROD, ask first]** Smoke test on `https://<project>.vercel.app` (see *Testing → Manual*), via Playwright MCP or by guiding the user. Sign-in itself is done by the user (no credentials in chat).
7. Update `.env.example` comments: the `NEXT_PUBLIC_CONVEX_*` values are injected by `npx convex deploy` in PROD; `CONVEX_DEPLOY_KEY` is Vercel Production-only.
8. Update `CLAUDE.md` → *Environments*: Vercel project/URL, deploy key scope, preview builds disabled, Convex prod `CLERK_JWT_ISSUER_DOMAIN`; remove the "must be replicated in Prod" pending note from any doc that has it.
9. Run `npm run lint`, `npm run test:run`, `npm run build` again.
10. Ask before committing. After merge to `main`, confirm with the user that Vercel triggered a new production deploy (acceptance criterion) and that it succeeded.

## PROD Safety

`CLAUDE.md` forbids PROD actions without explicit user confirmation. Every PROD-touching action in this feature:

| # | Action | Where | Who | Confirmation |
|---|---|---|---|---|
| 1 | Activate Convex integration in "LendLoop Prod" | Clerk Dashboard | **User** | User acts in dashboard |
| 2 | Customize "LendLoop Prod" session token (`name`, `email`) | Clerk Dashboard | **User** | User acts in dashboard |
| 3 | Read "LendLoop Prod" API keys (`pk_test`, `sk_test`) | Clerk Dashboard → Vercel | **User** (copy/paste between dashboards) | Secrets never in chat |
| 4 | Set `CLERK_JWT_ISSUER_DOMAIN` on Convex **prod** | Convex Dashboard | **User** (preferred) / Claude via `npx convex env set --prod` only on explicit request | Claude asks before any `--prod` command |
| 5 | Generate Convex Production deploy key | Convex Dashboard | **User** | Secret never in chat |
| 6 | Import Vercel project, set build command | Vercel Dashboard | **User** | User acts in dashboard |
| 7 | Add Vercel env vars (`CONVEX_DEPLOY_KEY`, Clerk keys), Production scope | Vercel Dashboard | **User** | Secrets never in chat |
| 8 | First prod deploy (Vercel "Deploy" → `npx convex deploy` to Convex prod) | Vercel | **User** clicks Deploy | Claude never runs `npx convex deploy` or the `vercel` CLI |
| 9 | Set Ignored Build Step → "Only build production" | Vercel Dashboard | **User** | User acts in dashboard |
| 10 | Read Convex prod env vars / logs (verification) | Convex Dashboard / CLI / MCP | **User** (preferred) / Claude read-only | Claude asks before each prod read |
| 11 | Smoke test on `*.vercel.app` (creates a user in "LendLoop Prod") | Browser | **User** signs in; Claude may drive navigation | Claude asks before starting |
| 12 | Merge to `main` (triggers a prod deploy) | GitHub / git | Claude, per workflow | Claude asks before merge/push |

Rules for Claude during this feature:

- Never run `npx convex deploy`, any `--prod` Convex command, Convex MCP with prod flags, or the `vercel` CLI unless the user explicitly asks for that specific command and confirms.
- Never request, echo or store `CONVEX_DEPLOY_KEY`, `CLERK_SECRET_KEY` or any `sk_` value. The Frontend API URL and `pk_test_` key are not secret but still go to dashboards, not tracked files.
- No changes to "LendLoop Dev", the Convex dev deployment or n8n in this feature.

## Environment Variables

| Name | DEV location | PROD location | Who sets it (PROD) |
|---|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` ("LendLoop Dev") | Vercel env, **Production** scope ("LendLoop Prod" `pk_test_...`) | User (Vercel dashboard) |
| `CLERK_SECRET_KEY` | `.env.local` ("LendLoop Dev") | Vercel env, **Production** scope, Sensitive ("LendLoop Prod" `sk_test_...`) | User (Vercel dashboard) |
| `CONVEX_DEPLOYMENT` | `.env.local` (written by `npx convex dev`) | **Not set** — the deploy key selects the deployment | — |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` (written by `npx convex dev`) | **Not set in Vercel** — injected into the build by `npx convex deploy --cmd` | Automatic |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `.env.local` (written by `npx convex dev`) | **Not set in Vercel** — injected into the build by `npx convex deploy --cmd` | Automatic |
| `CONVEX_DEPLOY_KEY` | — (never local) | Vercel env, **Production** scope only, Sensitive | User (Convex dashboard → Vercel dashboard) |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env vars, **dev** deployment ("LendLoop Dev" Frontend API URL) | Convex env vars, **prod** deployment ("LendLoop Prod" Frontend API URL) | User (Convex dashboard) |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` | Convex env vars (dev) — later spec | Convex env vars (prod) — later spec | Out of scope |

- Vercel **Preview** and **Development** scopes get **no** variables (preview builds are skipped; local dev uses `.env.local`).
- Variable names are unchanged — `.env.example` only needs updated comments.

## DEV vs PROD code

Nothing in the code needs to change between environments:

- `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN` per deployment → each deployment trusts its own Clerk app.
- `ConvexClientProvider` reads `NEXT_PUBLIC_CONVEX_URL` (inlined at build time from the injected prod value). Its error message mentions `npx convex dev`; that is fine — on Vercel the variable is always injected, and if the push fails the build never reaches this code.
- `src/proxy.ts` (`clerkMiddleware()`) reads `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from the environment; no domain-specific options are required for a Development instance. `authorizedParties` hardening belongs with a Clerk Production instance (custom domain) — out of scope.

## Files to Create / Modify

| Path | Action | Responsibility |
|---|---|---|
| `CLAUDE.md` | modify | *Environments*: Vercel project + `*.vercel.app` URL, `CONVEX_DEPLOY_KEY` (Production scope only), preview builds disabled (Ignored Build Step), Convex prod `CLERK_JWT_ISSUER_DOMAIN`; Clerk "LendLoop Prod" now configured |
| `.env.example` | modify (comments only) | Explain that in PROD `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL` are injected by `npx convex deploy` and must not be set in Vercel; `CONVEX_DEPLOY_KEY` is Vercel Production-only |
| `convex/whoami.ts`, `convex/whoami.test.ts`, `src/components/auth/AuthStatus.tsx` | **keep, unchanged** | Used for the PROD smoke test (see *Decisions*) |

No `vercel.json` is created: build command, env vars and Ignored Build Step live in the Vercel dashboard (fewer files, nothing secret in the repo).

## Acceptance Criteria

- [ ] `https://<project>.vercel.app/` loads signed out: LendLoop name, tagline, "Sign in to lend or borrow" button; no console or Convex errors
- [ ] Sign-in works with Clerk **"LendLoop Prod"** (Account Portal/modal shows the Prod app; Clerk "Development mode" badge is expected)
- [ ] Signed in: `UserButton` and the `whoami.get` identity block (subject/name/email) appear — identity reached Convex **prod**
- [ ] Convex Dashboard → **Production** → *Logs* shows `whoami:get` calls; dev deployment logs do **not** show them
- [ ] Browser DevTools → Network: Convex WebSocket goes to the **prod** `*.convex.cloud` host (≠ the dev host in `.env.local`)
- [ ] A user that exists in "LendLoop Dev" does **not** exist in "LendLoop Prod" (Clerk Dashboard → Users), and the subject shown in PROD differs from the DEV subject for the same email
- [ ] `CLERK_JWT_ISSUER_DOMAIN` on Convex prod = "LendLoop Prod" Frontend API URL; on Convex dev it is still the "LendLoop Dev" one
- [ ] Vercel env vars exist only in **Production** scope; `NEXT_PUBLIC_CONVEX_*` and `CONVEX_DEPLOYMENT` are not set in Vercel
- [ ] Ignored Build Step = "Only build production"; pushing a non-`main` branch does not produce a failed Vercel build
- [ ] Merging/pushing to `main` triggers a Vercel production deploy that succeeds and pushes to Convex prod
- [ ] `npm run lint`, `npm run test:run`, `npm run build` pass locally
- [ ] No secrets in tracked files or in chat; no PROD action was taken without explicit confirmation

## Testing

### Unit

No new Convex functions → no new tests. `convex/whoami.test.ts` must keep passing (`npm run test:run`).

### Manual (PROD smoke test)

1. Open `https://<project>.vercel.app` in a private window → signed-out page, no errors in the console.
2. DevTools → Network → WS: the Convex socket host is the **prod** deployment.
3. Click "Sign in to lend or borrow" → sign up/in with a test account (the user does this; this creates the first "LendLoop Prod" user).
4. The identity block shows subject/name/email → token validated by Convex prod with the Prod issuer and the custom claims.
5. Convex Dashboard → Production → *Logs* → `whoami:get` without errors.
6. Clerk Dashboard: the test user appears in "LendLoop Prod" only.
7. Sign out → back to the signed-out state.

## Rollback / Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vercel build fails at "Deploying to …" / auth config error | `CLERK_JWT_ISSUER_DOMAIN` missing on Convex **prod** | User sets it in Convex Dashboard (Production) → Vercel → Redeploy |
| Build fails: `Detected a non-production build environment and "CONVEX_DEPLOY_KEY" for a production Convex deployment` | Prod key reached a Preview build | Scope `CONVEX_DEPLOY_KEY` to Production only; confirm Ignored Build Step = "Only build production" |
| Build fails asking to log in / no deployment selected | `CONVEX_DEPLOY_KEY` missing in Production scope (or a Preview build ran without a key) | Add the key with Production scope; redeploy |
| Build fails in `npm run build` | App error (same as local) | Reproduce with `npm run build` locally; fix on a branch. Vercel keeps serving the last good deployment |
| Page loads but "Missing NEXT_PUBLIC_CONVEX_URL" | Build command is plain `npm run build` (no Convex wrapper) | Restore build command `npx convex deploy --cmd 'npm run build'`; redeploy |
| Clerk error: "Missing publishable key" / middleware 500 | Clerk vars not in Production scope, or deployment built before they were added | Fix scope → **Redeploy** (env changes need a new deployment) |
| Signed in on Clerk but identity block says "No identity received" / `isAuthenticated` stays false | Issuer mismatch: Convex prod `CLERK_JWT_ISSUER_DOMAIN` ≠ "LendLoop Prod" Frontend API URL (e.g. Dev URL pasted, trailing slash), or Convex integration not activated in "LendLoop Prod" (`aud: "convex"` missing) | Compare the two URLs exactly; activate the integration; after changing the env var, redeploy so `auth.config.ts` is re-pushed |
| Identity shows subject but name/email are "—" | Session token claims not replicated in "LendLoop Prod" | Copy the claims JSON from "LendLoop Dev" → Sessions; sign out/in |
| Sign-in shows the "LendLoop Dev" app / DEV users | Vercel has the Dev Clerk keys | Replace with "LendLoop Prod" keys → Redeploy |
| Clerk origin/redirect error on `*.vercel.app` | Unexpected for a Development instance | Capture the exact error; check "LendLoop Prod" domain/path settings; stop and report after 2–3 attempts |

**Rollback:** Vercel → Deployments → previous good deployment → **Promote to Production** (Instant Rollback). This does **not** roll back Convex prod functions; to revert those, revert the commit on `main` (new deploy). No schema exists yet, so there is no data migration risk in this phase.

## Decisions

| Topic | Options / conflict | Decision |
|---|---|---|
| Vercel Preview deployments | (a) Preview deploy key → a fresh Convex preview deployment per branch; (b) prod key in all scopes; (c) prod key Production-only + skip preview builds | **(c)**: `CONVEX_DEPLOY_KEY` Production-only + Ignored Build Step "Only build production". For a 2-day project previews add cost and setup (preview Convex deployments start empty and would need their own `CLERK_JWT_ISSUER_DOMAIN` defaults) with little value. (b) is unsafe and the CLI refuses it anyway (`isNonProdBuildEnvironment` check). Without skipping, every branch push would create a **failed** preview build (no key → no deployment selected). |
| Temporary `whoami` proof | Remove now vs keep | **Keep**: it is the only end-to-end proof that the Prod Clerk token reaches Convex prod (acceptance criterion). It already returns a minimal projection and is harmless when signed out. It is replaced/removed in spec 2 (users/RBAC), as already planned in `setup.md`. |
| `NEXT_PUBLIC_CONVEX_SITE_URL` in PROD | Community posts say `npx convex deploy` does not set it; official docs only say "`CONVEX_URL` (or similarly named)" | **Followed the installed CLI source (`convex@1.49`)**: `runCommand` sets both `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` for Next.js. The community reports predate this. Verify in the first build log (step 5 of Claude's steps). |
| `--cmd-url-env-var-name` | Some guides add `--cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL` | **Omit**: inferred for Next.js; keeps the build command identical to `CLAUDE.md` |
| Clerk on `*.vercel.app` | Convex's Vercel guide says "Clerk does not support `*.vercel.app`, configure a custom domain"; Clerk docs say only **Production instances** cannot use `*.vercel.app`, and recommend Development keys on the host's domain | **Follow Clerk docs** (the authority on Clerk): "LendLoop Prod" is a Development instance on `*.vercel.app`, as already decided in `CLAUDE.md`. Accepted limits: 100-user cap, "Development mode" badge, relaxed security posture, dev-browser token in querystring. |
| Issuer env var name | Clerk's guide uses `CLERK_FRONTEND_API_URL`; Convex docs use `CLERK_JWT_ISSUER_DOMAIN` | **`CLERK_JWT_ISSUER_DOMAIN`** — same as DEV (`setup.md`) |
| Setting the Convex prod env var | Clerk guide: `npx convex env --prod set ...`; Convex guide: dashboard | **Dashboard by the user** (`CLAUDE.md` forbids `--prod` commands without explicit request) |
| Where Vercel settings live | Dashboard vs `vercel.json` | **Dashboard** — no new tracked file; Ignored Build Step and env scopes are dashboard-native |

## Out of Scope

- Custom domain and Clerk **Production** instance (`pk_live_` / `sk_live_`), `authorizedParties` hardening
- Vercel Preview environments with Convex preview deployments / preview deploy keys
- Schema, `users` table, `requireUser` / `requireAdmin`, roles/RBAC, Trusted Lender (spec 2 — `whoami` removed there)
- UI pages (public tools list, listings, loans, admin)
- n8n: `[PROD]` workflows, `HMAC PROD` credential, `N8N_WEBHOOK_URL` / `N8N_WEBHOOK_SECRET` on Convex prod (automation specs)
- Monitoring, analytics, Vercel Deployment Protection settings
- Any change to "LendLoop Dev" or the Convex dev deployment

## References

- Convex — Using Convex with Vercel (build command, Production/Preview deploy keys, scoping): https://docs.convex.dev/production/hosting/vercel
- Convex — Deploy key types: https://docs.convex.dev/cli/deploy-key-types
- Convex — CLI (`convex deploy` deployment selection, `--cmd`, `env set --prod`): https://docs.convex.dev/cli
- Convex — `convex deploy` reference (flags): https://docs.convex.dev/cli/reference/deploy.md
- Convex — Configuring deployment URL (Next.js `NEXT_PUBLIC_CONVEX_URL`): https://docs.convex.dev/client/react/deployment-urls.md
- Convex — Clerk (dev vs prod instances, prod env var): https://docs.convex.dev/auth/clerk
- Convex CLI source (installed `convex@1.49`): `node_modules/convex/dist/cjs/cli/lib/deploy2.js` (`runCommand`), `node_modules/convex/dist/cjs/cli/lib/envvars.js` (`suggestedEnvVarNames`, `isNonProdBuildEnvironment`), `node_modules/convex/dist/cjs/cli/deploy.js` (non-production build check)
- Clerk — Convex integration (activation, Frontend API URL, session token claims, prod notes): https://clerk.com/docs/guides/development/integrations/databases/convex
- Clerk — Instances / environments (Development limits, `__clerk_db_jwt`, preview domains with dev keys): https://clerk.com/docs/guides/development/managing-environments
- Clerk — Deploy to Vercel (env vars per environment, no `*.vercel.app` for production): https://clerk.com/docs/guides/development/deployment/vercel
- Vercel — Project settings (Ignored Build Step options): https://vercel.com/docs/project-configuration/project-settings
- Vercel — Git settings: https://vercel.com/docs/project-configuration/git-settings
- Community reports that `NEXT_PUBLIC_CONVEX_SITE_URL` is not injected (Convex Discord, found via search; not followed — see *Decisions*): https://discord-questions.convex.dev
- Project rules: `CLAUDE.md`, `context/coding-standards.md`, `context/ai-interaction.md`, `context/features/setup.md`
