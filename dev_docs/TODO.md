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

## UserRoutes Follow-up

- [ ] add unique index on `email` in the User model to prevent race-condition duplicates under concurrent registration requests

## PetBasicInfo Follow-up

- [x] add pet ownership or ngo-access checks for `GET/PUT/DELETE /pets/{petID}...`, taking reference from `UserRoutes/src/middleware/selfAccess.js`; current PetBasicInfo auth only checks that a JWT exists, not whether the caller is allowed to access that pet
- [x] fix route context so PetBasicInfo services receive `petID` reliably; current services expect `routeContext.petID` but the active handler/router path only passes `event`, `pet`, and `body`
- [x] align PetBasicInfo response flow with UserRoutes by loading translations inside `response.js` and stop passing `translations` through handler, auth, guard, router, and services
- [x] align PetBasicInfo `authJWT.js` with the UserRoutes version; remove translation coupling and replace `others.*` error keys with keys that actually exist in PetBasicInfo locales or share a common locale namespace
- [x] switch PetBasicInfo router handlers to the lazy `require()` pattern used in UserRoutes so unrelated services are not loaded on every invocation
- [x] add SAM event coverage and local API tests for PetBasicInfo routes, including explicit OPTIONS/CORS checks with allowed and disallowed origins like the UserRoutes local test pass
- [x] add invalid-input regression tests for PetBasicInfo update routes to confirm schema failures stay `400` and do not drift into `500`
- [x] review PetBasicInfo services for explicit field projections and update-result checks so DB writes/readbacks fail predictably and do not rely on implicit assumptions
- [x] add structured PetBasicInfo logs to explain forced failures without deep code reading
- [ ] confirm PetBasicInfo `sam build` stays clean after the route and dependency changes

<!-- End of checklist -->

