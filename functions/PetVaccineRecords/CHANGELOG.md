# PetVaccineRecords Lambda — Refactoring Changelog

## Scope

Modernized `functions/PetVaccineRecords` to the same request-lifecycle and documentation baseline used by the refactored inventory lambdas.

This pass covered:

- thin `index.js` entrypoint with `src/handler.js` orchestration
- exact route dispatch through `src/router.js`
- fail-fast env validation, shared response helpers, and structured logging
- DB-backed owner-or-NGO authorization
- vaccine record soft-delete behavior and consistent deleted-record filtering
- documentation artifacts for runtime and API behavior

Not changed:

- route paths and main response contracts
- collection names
- pet ownership model
- absence of a restore endpoint for deleted vaccine rows

## Architecture Changes

Before:

- the refactor lacked the required lambda documentation artifacts
- delete behavior still used a hard delete against `vaccine_records`
- unsupported `PATCH` could be rejected by SAM/API routing before the Lambda router returned `405`

After:

```text
index.js
  -> src/handler.js
     -> src/cors.js
     -> src/middleware/authJWT.js
     -> src/middleware/guard.js
     -> src/config/db.js
     -> src/router.js
        -> src/services/vaccine.js
           -> src/middleware/selfAccess.js
           -> src/utils/response.js
           -> src/utils/sanitize.js
```

The active route surface is now documented in `README.md` and `API.md`, and the SAM template matches the routes intentionally exposed by this Lambda.

## Functional Improvements

- DELETE now performs a soft delete by setting `isDeleted: true` and `deletedAt` instead of permanently removing the row.
- GET list, PUT update, aggregate count maintenance, and latest-vaccine-date maintenance now ignore soft-deleted vaccine rows.
- Deleting an already deleted record now returns the same `404 vaccineRecord.vaccineRecordNotFound` path as a missing record.

## Validation And Error Handling Improvements

- The integration suite now asserts the exact `405` contract for unsupported `PATCH` instead of accepting either API-layer `403` or Lambda-layer `405`.
- Fixture-backed delete coverage now verifies that a deleted vaccine record no longer appears in subsequent GET responses.
- Existing malformed JSON, empty-body, and invalid ObjectId guard behavior is preserved.

## Security Improvements

- Delete flows now meet the checklist baseline by preferring soft delete over hard delete, improving auditability and recovery.
- Deleted vaccine rows are consistently hidden from normal read/update flows, reducing deleted-record state drift.
- Exact route dispatch remains enforced through `${event.httpMethod} ${event.resource}` matching.
- Owner-or-NGO authorization remains DB-backed through `loadAuthorizedPet()` before record mutation.

## Performance And Maintainability Improvements

- Soft-delete filtering is centralized through a shared active-record filter inside `src/services/vaccine.js`, reducing query drift across GET, PUT, and DELETE-related maintenance queries.
- Documentation now exists in the lambda folder, making the current route surface and operational constraints discoverable without reopening code.
- The SAM template now matches the router-level unsupported-method contract, reducing false negatives in local verification.

## Constraints And Deferred Work

- `code-owned`: no restore endpoint exists for soft-deleted vaccine records. Recovery still requires manual DB intervention.
- `code-owned`: fixture-backed lifecycle coverage still depends on `TEST_PET_ID`, `TEST_OWNER_USER_ID`, and `TEST_NGO_ID` being configured for the local SAM environment.
- `infra-owned`: full integration verification still depends on `sam local start-api` being up and reachable during test runs.

## Result Of This Stage

PetVaccineRecords now meets the checklist baseline for the findings in this pass: vaccine deletes are soft deletes, deleted records are consistently excluded from active flows, the unsupported-method test locks the exact `405` contract down, and the required documentation artifacts now exist in the lambda folder. Remaining work is operational rather than structural: local API availability and any future undelete workflow are outside this pass.
