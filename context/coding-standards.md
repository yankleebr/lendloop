# Coding Standards

## Language

- Code, identifiers, comments, docs and commit messages in **English**

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all props, API responses, and data models
- Use type inference where obvious, explicit types where helpful
- Prefer Convex generated types (`Doc<"tools">`, `Id<"loans">`) over hand-written duplicates

## React

- Functional components only (no class components)
- Use hooks for state and side effects
- Keep components focused - one job per component
- Extract reusable logic into custom hooks

## Next.js

- Server components by default
- Only use `'use client'` when needed (interactivity, hooks, browser APIs, Convex `useQuery`/`useMutation`)
- **No Server Actions or Prisma** — all data reads/writes go through Convex functions
- Next.js API routes only when Convex cannot do the job (none expected; n8n talks to Convex HTTP actions directly)
- Route protection via Clerk `clerkMiddleware` in `src/proxy.ts`
- Dynamic routes for item/collection pages

## Convex

- Folder: `convex/` at the project root; schema in `convex/schema.ts`
- Function types:
  - `query` — reads (reactive)
  - `mutation` — transactional writes
  - `action` — side effects / external calls (e.g. calling the n8n webhook); never write to the DB directly from an action, call an `internalMutation`
  - `httpAction` — HTTP endpoints for n8n, registered in `convex/http.ts`
  - `internal*` variants for anything that must not be callable from the client
- **Validate all arguments** with Convex validators (`v.*`) on every public function
- **Authorization lives in Convex functions, not the UI**:
  - Every public function resolves the current user via `ctx.auth.getUserIdentity()` through shared helpers (e.g. `requireUser(ctx)`, `requireAdmin(ctx)`)
  - Ownership checks (listing owner, borrower, lender) happen server-side before any read of private data or any write
  - Never trust a `userId`, `role` or `ownerId` sent from the client
- Use indexes (`.withIndex`) for filtered queries; avoid `.filter` on large tables
- Side effects after a mutation are scheduled with `ctx.scheduler.runAfter(0, internal.x.y, args)`
- Schema changes are applied by `npx convex dev` (DEV). Never run `npx convex deploy` manually — PROD deploys go through Vercel

## Integrations (n8n)

- Outgoing webhooks (Convex → n8n) are sent from an `internalAction`, signed with HMAC-SHA256 using `N8N_WEBHOOK_SECRET` (Convex env var)
- Incoming requests (n8n → Convex `httpAction`) must verify the HMAC signature (constant-time compare) and a timestamp to reject replays before doing anything else
- Write operations triggered by n8n must be **idempotent** (idempotency key stored and checked before inserting)
- Payloads contain only the fields the workflow needs (no emails/PII unless required for the notification)
- Failures must be visible: retries with backoff and a logged failure state — never fail silently
- Exported n8n workflows live in `n8n/workflows/` and must never contain secrets

## Tailwind CSS v4

**CRITICAL**: We are using Tailwind CSS v4, which uses CSS-based configuration.

- **DO NOT** create `tailwind.config.ts` or `tailwind.config.js` files (those are for v3)
- All theme configuration must be done in CSS using the `@theme` directive in `src/app/globals.css`
- Use CSS custom properties for colors, spacing, etc.

## File Organization

- Pages: `src/app/[route]/page.tsx`
- Components: `src/components/[feature]/ComponentName.tsx`
- UI primitives (shadcn): `src/components/ui/`
- Hooks: `src/hooks/`
- Types: `src/types/[feature].ts`
- Lib/Utils: `src/lib/[utility].ts`
- Convex functions: `convex/[feature].ts`; shared helpers in `convex/lib/`
- n8n workflow exports: `n8n/workflows/`

## Naming

- Components: PascalCase (`ToolCard.tsx`)
- Files: Match component name or kebab-case
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Types/Interfaces: PascalCase (no prefix)

## Styling

- Tailwind CSS for all styling
- Use shadcn/ui components where applicable
- No inline styles
- Simple, pleasant layout; responsive down to mobile width

## Error Handling

- Convex functions throw `ConvexError` with user-friendly messages for expected failures (not authorized, not found, invalid state)
- Client catches errors from mutations and shows them via toast (Sonner)
- Never leak internal details (stack traces, secrets) in error messages or HTTP responses

## Testing

- **Vitest** + **convex-test** — run with `npm test` (watch) or `npm run test:run` (CI)
- Test **Convex functions and utilities only** — no component tests
- Priority: authorization rules (user vs admin, owner vs non-owner), loan status transitions, HMAC verification, idempotency
- Test files live next to the source: `convex/loans.ts` → `convex/loans.test.ts`
- Import test utilities explicitly: `import { describe, it, expect, vi } from 'vitest'`

### convex-test example

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

test("non-owner cannot delete a listing", async () => {
  const t = convexTest(schema);
  const alice = t.withIdentity({ subject: "user_alice" });
  const bob = t.withIdentity({ subject: "user_bob" });
  const toolId = await alice.mutation(api.tools.create, { name: "Drill", category: "power_tools", condition: "good", description: "" });
  await expect(bob.mutation(api.tools.remove, { toolId })).rejects.toThrow();
});
```

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
