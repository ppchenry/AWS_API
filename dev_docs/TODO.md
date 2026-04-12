# Refactor Checklist For Other Lambdas

- [ ] keep the AWS entry file thin and move request orchestration into handler and router layers
- [ ] keep endpoint contracts stable unless the frontend and consumers are updated together
- [ ] align `template.yaml` or SAM events with the real router paths before local testing
- [ ] validate env vars at startup so bad config fails early and predictably
- [ ] centralize DB connection reuse instead of reconnecting inside each route
- [ ] standardize success and error responses before moving route logic around
- [ ] if using Zod v4, always read validation details from `error.issues`, not `error.errors`
- [ ] add schema validation before business logic and ensure invalid input returns `400`, not `500`
- [ ] audit CORS preflight explicitly with allowed and disallowed origins
- [ ] verify auth checks happen before private route logic, but after OPTIONS handling
- [ ] add self-access or ownership checks for routes that accept userId, email, or similar identity fields
- [ ] normalize identifiers like email and phone before lookups to avoid inconsistent behavior
- [ ] prefer focused query projections and smaller aggregation payloads when refactoring list endpoints
- [ ] treat local SAM latency as a regression signal, not a production benchmark
- [ ] test invalid-input cases after refactor, not just happy-path requests
- [ ] confirm all runtime dependencies are declared in `package.json` before relying on SAM build output
- [ ] document what was improved and what was intentionally left constrained after each refactor stage
- [ ] standardize cross-Lambda locale keys and error-key taxonomy only after the major Lambda refactors settle; keep service name separate from `errorKey` and avoid baking Lambda names into shared keys

## UserRoutes Follow-up

- [ ] add unique index on `email` in the User model to prevent race-condition duplicates under concurrent registration requests

<!-- End of checklist -->