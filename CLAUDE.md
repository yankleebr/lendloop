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
| Next.js | `localhost:3000` | Vercel (`*.vercel.app`) |
| Convex | dev deployment | prod deployment |
| Clerk | app "LendLoop Dev" (Development instance) | app "LendLoop Prod" (Development instance — `*.vercel.app` cannot host a Clerk Production instance) |
| n8n Cloud | `[DEV]` workflows + `HMAC DEV` credential | `[PROD]` workflows + `HMAC PROD` credential |

### Environment rules

- Always work against **DEV** by default. If an instruction does not name an environment, assume DEV.
- **NEVER** run any of the following unless the user explicitly asks and confirms it is intentional:
  - `npx convex deploy`
  - `npx convex env set --prod` / `npx convex env list --prod` / any `--prod` Convex command
  - Convex MCP with `--prod` or `--dangerously-enable-production-deployments`
  - Changes to the Clerk app "LendLoop Prod"
  - Changes to `[PROD]` n8n workflows or the `HMAC PROD` credential
- Production deploys happen only through Vercel when `main` is pushed (build command: `npx convex deploy --cmd 'npm run build'`).

## Secrets

- Next.js secrets live in `.env.local` (DEV) and Vercel env vars (PROD). `.env*` is gitignored; `.env.example` lists variable names only.
- Convex function secrets (`CLERK_JWT_ISSUER_DOMAIN`, `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`) live in **Convex environment variables**, never in `.env.local` or code.
- n8n secrets live in **n8n credentials** (Crypto credential for HMAC). Exported workflow JSON in `n8n/workflows/` must never contain secrets.
