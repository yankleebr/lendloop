# Test Action

1. Read current-feature.md to understand what was implemented
2. Identify Convex functions (queries, mutations, actions, HTTP actions) and utility functions added/modified for this feature
3. Check whether tests already exist for those functions
4. For functions without tests that have testable logic, write unit tests:
   - Use Vitest + convex-test (`convexTest(schema)`, `t.withIdentity(...)`)
   - Focus on Convex functions and utilities (not components)
   - Test the happy path and error cases
   - Always cover authorization: unauthenticated, non-owner, user vs admin
   - For integrations: HMAC verification (valid / invalid / expired timestamp) and idempotency (same key twice = one record)
   - Don't write tests just for the sake of it. Use your best judgment
5. Run `npm run test:run` to verify all tests pass
6. Report test coverage for the new feature code
