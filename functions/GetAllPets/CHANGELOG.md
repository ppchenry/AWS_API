# GetAllPets - CHANGELOG

## Refactor v2.0.1 - NGO Location Search And Handoff Sync

### Scope

Follow-up patch after the Tier 2 refactor to align the NGO search contract, local schema surface, tests, and handoff documentation with the current runtime behavior.

**Changed**: NGO search behavior, local Pet schema field coverage, integration tests, API handoff docs, verification records

### Functional Changes

- `GET /pets/pet-list-ngo/{ngoId}` search now includes `locationName` in addition to `name`, `animal`, `breed`, `ngoPetId`, and `owner`
- GetAllPets local `Pet` schema now declares `locationName` and `position` so this Lambda matches the stored pet document shape used by adjacent pet flows
- Tier 2 integration coverage now includes a dedicated location-based NGO search assertion against real fixture data

### Documentation And Verification Updates

- API handoff documentation corrected to reflect actual runtime behavior for auth failures, pagination edge cases, localization notes, and OPTIONS/CORS behavior
- Verification status refreshed to the latest full focused suite run
- Latest verified status: `52 passed, 2 skipped` on `2026-04-17`

---

## Refactor v2.0.0 - In-Situ Modernization

### Scope

Full Tier 2 refactor of the GetAllPets Lambda. Restructured from a 416-line monolithic `index.js` into a modular `src/` architecture matching the UserRoutes baseline.

**Changed**: entrypoint, auth, CORS, business logic, response handling, validation, DB connection, logging  
**Not changed in this refactor stage**: route set, locale key set

### Architecture Changes

- `index.js` reduced to a thin handler delegation layer
- Canonical lifecycle: CORS -> Auth -> Guard -> DB -> Route Dispatch
- Exact route matching via `router.js`
- Lazy service loading via `lazyRoute()`
- Dedicated modules for handler, router, guard, CORS, auth, DB, services, models, utils, and schemas

### File Structure

```text
functions/GetAllPets/
  index.js
  src/
    handler.js
    router.js
    cors.js
    config/
      env.js
      db.js
    middleware/
      authJWT.js
      guard.js
      selfAccess.js
    services/
      ngoPetList.js
      deletePet.js
      updatePetEye.js
      userPetList.js
    models/
      pet.js
      RateLimit.js
    locales/
      en.json
      zh.json
    utils/
      response.js
      logger.js
      i18n.js
      validators.js
      sanitize.js
      zod.js
      rateLimit.js
    zodSchema/
      envSchema.js
      petSchema.js
```

### Functional Improvements

- NGO pet list uses parallel `find()` and `countDocuments()`
- User pet list uses parallel `find()` and `countDocuments()`
- `updatePetEye` uses atomic `findOneAndUpdate` with `$push`
- `deletePet` uses atomic `updateOne`

### Validation And Error Handling Improvements

- JSON parse errors handled before DB connection as `400`
- Empty POST and PUT bodies return `400`
- Path parameter ObjectId format validated before DB access
- Mutation inputs validated with Zod
- Standardized error envelope with `errorKey` and `requestId`

### Security Improvements

- JWT required for write routes
- Public access retained only for NGO pet listing
- Ownership enforced through path-based self-access for user list and atomic ownership filters for mutations
- Sensitive write routes rate-limited
- Error handling no longer leaks raw internal errors
- Fuzzy route matching replaced with exact route dispatch
- Outbound pet payloads sanitized before response

### Operational Improvements

- Lambda-safe Mongo connection reuse with guarded model registration
- Environment validation at cold start
- `lean()` used on read queries
- Translation file caching at module level
- Structured JSON logging
- HS256 pinned during JWT verification

### Constraints

- No creation flows exist in this Lambda, so duplicate-create race handling is not applicable
- Lifecycle tests that mutate real pet state still require a disposable fixture id

### Result Of This Stage

GetAllPets is aligned with the current monorepo refactor baseline. Authenticated mutations are protected, public reads are constrained to the NGO listing route, ownership checks are enforced, and the Lambda uses standardized validation, response, logging, and routing patterns.

Latest verification status:

- full suite: `52` integration tests passed
- `2` lifecycle tests remain skipped due to missing disposable fixture `TEST_DISPOSABLE_PET_ID`
- detailed evidence: `dev_docs/test_reports/GETALLPETS_TEST_REPORT.md`
