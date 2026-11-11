# AI Interaction Guidelines

## Communication

- Be concise and direct
- Explain non-obvious decisions briefly
- Ask before large refactors or architectural changes
- Don't add features not in the project spec
- Never delete files without clarification
- Talk to the user in Brazilian Portuguese; write everything in the repository in English

## Workflow

This is the common workflow that we will use for every single feature/fix:

1. **Document** - Document the feature in @context/current-feature.md (specs are written by the user in `context/features/`)
2. **Branch** - Create new branch for feature, fix, etc
3. **Implement** - Implement the feature/fix described in @context/current-feature.md, always against the DEV environment
4. **Test** - Verify it works in the browser. Run `npm run test:run` for unit tests (Convex functions and utilities). Run `npm run build` and fix any errors
5. **Iterate** - Iterate and change things if needed
6. **Commit** - Only after build passes and everything works
7. **Merge** - Merge to main (pushing `main` triggers the Vercel PROD deploy)
8. **Delete Branch** - Delete branch after merge
9. **Review** - Review AI-generated code periodically and on demand
10. Mark as completed in @context/current-feature.md and add to history

Do NOT commit without permission and until the build passes. If build fails, fix the issues first.

## Branching

We will create a new branch for every feature/fix. Name branch **feature/[feature]** or **fix/[fix]**, etc. Ask to delete the branch once merged.

## Commits

- Ask before committing (don't auto-commit)
- Use conventional commit messages (feat:, fix:, chore:, etc.)
- Keep commits focused (one feature/fix per commit)
- Never put "Generated With Claude" or Co-Authored-By Claude lines in the commit messages

## Environments

- DEV by default. Never touch PROD (Convex prod, Clerk "LendLoop Prod", `[PROD]` n8n workflows) without an explicit request — see `CLAUDE.md`.
- n8n changes: validate the `[DEV]` workflow first, then duplicate as `[PROD]` only when the user asks.

## When Stuck

- If something isn't working after 2-3 attempts, stop and explain the issue
- Don't keep trying random fixes
- Ask for clarification if requirements are unclear

## Code Changes

- Make minimal changes to accomplish the task
- Don't refactor unrelated code unless asked
- Don't add "nice to have" features
- Preserve existing patterns in the codebase

## Code Review

Review AI-generated code periodically, especially for:

- Security (auth and role checks inside Convex functions, input validation, webhook signatures)
- Performance (unnecessary re-renders, unindexed Convex queries)
- Logic errors (edge cases, loan status transitions, date overlaps)
- Patterns (matches existing codebase?)
