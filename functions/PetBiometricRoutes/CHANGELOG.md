# CHANGELOG

## Scope

- Refactored `PetBiometricRoutes` from a monolithic entrypoint into a handler-driven structure under `src/`.
- Preserved the deployed route surface: `GET /petBiometrics/{petId}`, `POST /petBiometrics/register`, and `POST /petBiometrics/verifyPet`.
- Added a dedicated SAM-local integration suite and service documentation for the refactored flow.

## Architecture Changes

- `index.js` remains a thin delegation entrypoint.
- Added `src/handler.js` to enforce the canonical request lifecycle: OPTIONS, JWT auth, cheap guard validation, DB bootstrap, exact route dispatch, service execution, catch-all error handling.
- Added `src/router.js` with exact `${httpMethod} ${event.resource}` matching.
- Split infrastructure responsibilities into dedicated modules for env validation, DB connections, auth, CORS, structured logging, localized responses, rate limiting, S3 upload, and FaceID calls.
- Moved business workflows into `src/services/petBiometric.js`.

## Functional Improvements

- Replaced fuzzy route matching with exact route dispatch.
- Registration now performs standardized validation before DB work, writes the pet registration flag and biometric record inside one transaction, and returns `201` only for creates and `200` for updates.
- Verification now validates access credentials, image input, file type, and file size before calling external services.
- Registration now enforces URL validation on stored biometric image sources before persistence.
- Verification responses are normalized before being returned so the success contract is not defined by raw upstream provider payloads.
- GET retrieval now returns structured success responses and consistent 404 handling when biometric data is not present.
- The previous undefined `addImageFileToStorage` dependency is now implemented explicitly via `src/utils/s3Upload.js`.
- Business credential verification now aligns its lookup with a matching `(access_key, access_secret)` unique index and rejects ambiguous credential matches at runtime instead of relying on an index that referenced a non-schema field.

## Testing And Documentation Updates

- Added `__tests__/test-petbiometricroutes.test.js` to cover CORS, JWT auth, exact-route `405` handling, guard validation, owner/stranger access control, registration create/update persistence, and verify-path error handling.
- The suite currently defines `41` integration cases. In the latest SAM-local run, `33` executed and passed while `8` business-database-dependent cases were environment-gated by external business-cluster connectivity.
- Added `API.md` and a structured test report under `dev_docs/test_reports/PETBIOMETRICROUTES_TEST_REPORT.md`.

## Validation And Error Handling Improvements

- Invalid JSON now returns `400` with `others.invalidJSON` instead of falling through to a generic failure path.
- Missing or invalid `petId` now returns `400` before service execution.
- Zod validation fallback errors now stay inside the locale dot-key contract through `others.invalidInput` instead of returning raw English fallback text.
- FaceID transport and non-success failures are now logged with provider context for production diagnosis.
- External upload and FaceID failures return structured localized errors instead of raw exception messages.
- All service catch blocks now log with structured JSON and return `createErrorResponse(500, "others.internalError", event)`.

## Security Improvements

- Added strict JWT verification with `algorithms: ["HS256"]`.
- Removed reliance on caller-supplied `userId` for authorization decisions.
- Added DB-backed ownership checks through `src/middleware/selfAccess.js` for every live route.
- Added rate limiting to registration and verification flows.
- Standardized CORS handling so OPTIONS requests are handled before auth and disallowed origins are rejected.
- Registration no longer reports success if the pet record can no longer be matched as an active pet when the write is applied, and it avoids partial pet/biometric writes by using a single transaction for that workflow.

## Performance And Maintainability Improvements

- Added lazy route loading to keep cold-start work proportional to the requested route.
- Added singleton MongoDB connection reuse with `maxPoolSize: 1` for both primary and business databases.
- Added startup environment validation with Zod to fail fast on broken deployments.
- Centralized locale lookup and response shaping to eliminate repeated inline response assembly.

## Constraints And Deferred Work

- `infra-owned`: the code now declares a unique index on `pets_facial_image.petId` and uses atomic upsert semantics, but I20 remains deferred until that unique index is confirmed to exist in the deployed MongoDB environment.
- `environment-owned`: end-to-end proof of the business-credential verification path still depends on external access to the business Atlas cluster. The code path is implemented and schema-backed, but the latest local test run could not fully exercise that dependency.

## Result Of This Stage

- `PetBiometricRoutes` now follows the UserRoutes-style lifecycle and module boundaries, closes the highest-risk security gaps in auth and ownership handling, standardizes responses and logging, removes the monolithic control flow that previously mixed routing, DB setup, validation, and business logic in one file, and includes a documented SAM-local integration suite for the refactored contract.
