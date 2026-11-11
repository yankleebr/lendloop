---
name: cleanup
description: Clean up project housekeeping tasks (add "run" to execute fixes)
argument-hint: run|check
---

Review the codebase for cleanup tasks:

1. Make sure that the history in @context/current-feature.md is in order from oldest to newest
2. Find unnecessary console.log statements in `src/` and `convex/`
3. Find unused imports
4. Check for stale TODO comments
5. Find orphaned/unused files and unused Convex functions
6. Check that context files match actual project state
7. Check that every variable name in `.env.example` exists in `.env.local` (report names only — never print values). Check that the Convex DEV env (`npx convex env list`) has `CLERK_JWT_ISSUER_DOMAIN`, `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` (names only). Do NOT inspect PROD unless the user explicitly asks
8. Check that exported workflows in `n8n/workflows/` contain no secrets (credential values, signing secrets, tokens)
9. Find `@ts-ignore` / `@ts-expect-error` comments that might be stale

**Mode: $ARGUMENTS**

If no argument or argument is "check":

- Only report findings, don't modify anything
- List what WOULD be cleaned up

If the argument is "run" or "fix":

- First, report all findings with numbered items
- Then ask: "Which items would you like me to fix? (enter numbers like 1,3,5 or 'all' or 'none')"
- Wait for user response before making any changes
- Only fix the items the user specifies
- Report what you changed
