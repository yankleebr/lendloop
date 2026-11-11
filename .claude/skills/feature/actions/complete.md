# Complete Action

1. Confirm `npm run build` and `npm run test:run` pass, then ask the user for permission to commit
2. Stage all changes and commit with a descriptive conventional message (no Claude attribution lines)
3. Switch to main and merge the feature branch (no push yet)
4. Delete the local feature branch
5. Reset current-feature.md:
   - Change H1 back to `# Current Feature`
   - Set Status back to "Not Started"
   - Clear Goals and Notes sections (keep placeholder comments)
   - Add feature summary to the END of History
6. Commit the reset: `chore: reset current-feature.md after completing [feature]`
7. Push main to origin ONCE (single push with all changes) — this triggers the Vercel PROD deploy
8. If feature branch was previously pushed, delete it from origin
9. If the feature changed n8n workflows, remind the user that `[PROD]` workflows must be updated manually (only when they ask)
