## AuthRoute Follow-up

- [ ] refactor `AuthRoute` into thin entrypoint plus `src/handler.js` and focused refresh-token service flow
- [ ] move refresh-token cookie parsing, token rotation, and access-token issuance into centralized helpers with standardized responses
- [ ] validate env at startup for `MONGODB_URI`, `JWT_SECRET`, `REFRESH_TOKEN_MAX_AGE_SEC`, `ALLOWED_ORIGINS`, and dual-write settings
- [ ] replace ad hoc CORS/error handling in `AuthRoute` with the same response and logging pattern used by refactored Lambdas
- [ ] preserve current refresh contract while cleaning up DB reuse and secondary dual-write behavior

## PetLostandFound Follow-up

- [ ] refactor `PetLostandFound` into a thin entrypoint plus full `src/handler.js` and `src/router.js` split
- [ ] separate `PetLostandFound` business workflows into focused services while preserving existing route contracts
- [ ] standardize `PetLostandFound` CORS, auth, validation, response handling, and DB reuse to match the refactor checklist
- [ ] add targeted post-refactor invalid-input and route-level testing for `PetLostandFound`

<!-- End of checklist -->