# LendLoop

Neighborhood tool-lending board: neighbors list tools they are willing to lend, request loans from each other, and receive automated notifications and reminders orchestrated by n8n.

## Language

- Everything in the repository (code, comments, `.md` files, commit messages) is written in **English**.
- Conversation with the user is in **Brazilian Portuguese**.

## Context Files

Read the following for full project context:

@context/project-overview.md
@context/coding-standards.md
@context/ai-interaction.md
@context/current-feature.md

## Commands

```bash
npm run dev        # Next.js dev server at localhost:3000
npx convex dev     # Convex dev deployment (watch + push functions/schema) — run alongside npm run dev
npm run build      # Production build
npm run lint       # ESLint
npm test           # Vitest (watch)
npm run test:run   # Vitest (single run)
```

## Environments

| Piece | DEV | PROD |
|---|---|---|
| Next.js | `localhost:3000` | Vercel project `lendloop` → https://lendloop-tawny.vercel.app |
| Convex | dev deployment (`effervescent-squid-656`) | prod deployment (`enchanted-raven-234`) |
| Convex HTTP Actions URL (n8n → Convex) | `https://effervescent-squid-656.convex.site` | `https://enchanted-raven-234.convex.site` |
| Clerk | app "LendLoop Dev" (Development instance) | app "LendLoop Prod" (Development instance — `*.vercel.app` cannot host a Clerk Production instance) |
| n8n Cloud | `[DEV]` workflows (`[DEV] LendLoop — Loan notifications (WF1)`, `[DEV] LendLoop — Overdue reminders (WF2)`, `[DEV] LendLoop — Error handler (WF3)`) + `HMAC DEV` / `HMAC INBOUND DEV` / `Gmail DEV` credentials | `[PROD]` workflows + `HMAC PROD` / `HMAC INBOUND PROD` / `Gmail PROD` credentials |

### PROD configuration (Vercel dashboard / Convex dashboard)

- Vercel build command: `npx convex deploy --cmd 'npm run build'`. It pushes functions/schema to Convex prod, then runs the Next.js build with `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL` injected — these and `CONVEX_DEPLOYMENT` are **not** set in Vercel.
- Vercel env vars, **Production scope only**: `CONVEX_DEPLOY_KEY` (Convex production deploy key, `deployment:deploy` only), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` ("LendLoop Prod" keys). Preview/Development scopes have no variables.
- Preview builds are disabled: Vercel → Ignored Build Step = "Only build production".
- Convex prod env var `CLERK_JWT_ISSUER_DOMAIN` = "LendLoop Prod" Frontend API URL. Both Clerk apps have the Convex integration activated and the same session token claims (`name`, `email`).
- Rollback: Vercel Instant Rollback (does not revert Convex prod functions — revert the commit on `main` for that).

### Environment rules

- Always work against **DEV** by default. If an instruction does not name an environment, assume DEV.
- **NEVER** run any of the following unless the user explicitly asks and confirms it is intentional:
  - `npx convex deploy`
  - `npx convex env set --prod` / `npx convex env list --prod` / any `--prod` Convex command
  - Convex MCP with `--prod` or `--dangerously-enable-production-deployments`
  - Changes to the Clerk app "LendLoop Prod"
  - Changes to `[PROD]` n8n workflows (WF1, WF2, WF3) or the `HMAC PROD` / `HMAC INBOUND PROD` / `Gmail PROD` credentials
- Production deploys happen only through Vercel when `main` is pushed (build command: `npx convex deploy --cmd 'npm run build'`).

## Secrets

- Next.js secrets live in `.env.local` (DEV) and Vercel env vars (PROD). `.env*` is gitignored; `.env.example` lists variable names only.
- Convex function secrets (`CLERK_JWT_ISSUER_DOMAIN`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`, `N8N_INBOUND_SECRET`) live in **Convex environment variables**, never in `.env.local` or code.
  - `N8N_WEBHOOK_URL` = the **Production URL** of the `[DEV]` / `[PROD]` Workflow 1 webhook.
  - `N8N_WEBHOOK_SECRET` = the same string as the `HMAC DEV` / `HMAC PROD` credential's *Hmac Secret*, ≥ 32 chars, used as UTF-8 bytes (never hex/base64-decoded).
  - `N8N_INBOUND_SECRET` (n8n → Convex, Workflow 2) = the same string as the `HMAC INBOUND DEV` / `HMAC INBOUND PROD` credential's *Hmac Secret*; a **different** secret from `N8N_WEBHOOK_SECRET`, same rules. Missing → the `/n8n/v1/*` endpoints answer 503.
- n8n secrets live in **n8n credentials** (Crypto credential for HMAC). Gmail access lives only in the n8n credentials `Gmail DEV` / `Gmail PROD` (same dedicated LendLoop Gmail account). Exported workflow JSON in `n8n/workflows/` must never contain secrets.
