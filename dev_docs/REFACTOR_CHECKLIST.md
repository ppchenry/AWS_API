# Lambda Refactor Checklist

Use this as the practical done-standard for refactoring Lambdas in this monorepo.

The goal is not to make every Lambda look identical. The goal is to make each Lambda safer to change, easier to trace, and easier to test.

## Core Standard

- [ ] keep the AWS entry file thin and move request orchestration into a handler or equivalent flow layer
- [ ] replace giant switch or nested if routing with an explicit route map when the Lambda has multiple endpoints
- [ ] keep endpoint contracts stable unless frontend and downstream consumers are updated together
- [ ] align `template.yaml` or SAM events with the real router paths before local testing
- [ ] validate required env vars early so bad config fails fast and predictably
- [ ] centralize DB connection reuse instead of reconnecting inside each route
- [ ] standardize success and error response shape before moving business logic around — every error must include `success: false`, a machine-readable `errorKey` (locale dot-key), a translated `error` string, and a `requestId` for CloudWatch traceability
- [ ] add structured logging for unexpected failures and important request-flow boundaries

## Validation And Safety

- [ ] add schema validation before business logic
- [ ] make sure invalid input returns `400`, not `500`
- [ ] if using Zod v4, read validation details from `error.issues`, not `error.errors`
- [ ] use locale dot-keys as Zod error messages — never let raw Zod type-level strings (e.g. `"Invalid input: expected string, received undefined"`) reach the response; use `{ error: "locale.key" }` on every required `z.string()` field so type failures and missing-field failures both return a clean key
- [ ] normalize identifiers like email and phone before lookups
- [ ] reject unexpected fields where appropriate instead of silently accepting them
- [ ] verify auth checks happen before private route logic, but after OPTIONS handling
- [ ] add self-access or ownership checks for routes that accept user ID, pet ID, email, or other identity-bearing fields
- [ ] ensure deleted or inactive records are handled consistently across read and write paths

## Query And Service Design

- [ ] prefer focused DB projections instead of returning broad model payloads by default
- [ ] keep list endpoints small and explicit; split overloaded endpoints when they mix unrelated data
- [ ] use query params for filtering collections and path params for resource identity
- [ ] avoid pushing identity through request bodies when JWT identity or path params should define ownership
- [ ] move repeated normalization, response, logging, or validation helpers into shared utilities only after at least 2 to 3 Lambdas need the same pattern

## CORS, Auth, And Platform Behavior

- [ ] handle OPTIONS preflight early and explicitly
- [ ] test CORS with both allowed and disallowed origins
- [ ] confirm auth bypasses are impossible in production mode
- [ ] make sure auth failures and validation failures still return CORS headers when needed
- [ ] treat local SAM latency as a regression signal, not a production benchmark

## Testing And Verification

- [ ] run `sam validate` after route or template changes
- [ ] run `sam build` after dependency or handler changes
- [ ] perform local API tests against the real Lambda entrypoint with SAM CLI
- [ ] test both happy-path and invalid-input cases
- [ ] test at least one missing-resource path
- [ ] test at least one authorization-denied path for private resources
- [ ] confirm all runtime dependencies are declared in `package.json`
- [ ] verify logs are useful enough to explain a forced failure without deep code reading

## Documentation

- [ ] update or add a changelog for what changed and what was intentionally deferred
- [ ] record known follow-up items instead of silently carrying them forward
- [ ] document any route drift between legacy paths and current router behavior
- [ ] note whether the Lambda is now ready for integration testing

## Stop Criteria

Stop refactoring and move to the next Lambda when these are true:

- [ ] request flow is understandable without reading one giant file
- [ ] validation and auth behavior are predictable
- [ ] local SAM testing works for the important routes
- [ ] major failure paths no longer collapse into generic `500` responses
- [ ] logging is good enough to debug the next real failure faster
- [ ] remaining work is optimization or API redesign, not structural instability

## Right-Sizing Rule

Use the UserRoutes refactor as the quality bar, not as a file-structure religion.

- small Lambda: keep it simple, but still apply validation, response consistency, DB reuse, logging, auth, and SAM testing
- medium Lambda: use thin handler, router, focused services, and shared utilities where it reduces risk
- high-risk Lambda: use the full pattern with stronger guards, cleaner service boundaries, and better observability

## Suggested Refactor Order For Each Lambda

1. stabilize request flow and routing
2. standardize response and error handling
3. fix validation and auth ordering
4. add ownership or self-access checks
5. clean up heavy queries or overloaded endpoints
6. run SAM validation and local route tests
7. document what changed and stop when the Lambda is stable enough