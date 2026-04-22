# Changelog - PetInfoByPetNumber Lambda

## [1.1.0] - 2026-04-22 - Public lookup hardening and checklist closure

### Scope

This update closes the remaining PetInfoByPetNumber review findings for the public tag-based lookup.

Files changed:
- `src/handler.js` - adds an explicit public-field MongoDB projection and stops returning the internal Mongo `_id`
- `src/utils/sanitize.js` - removes internal linkage identifiers from the outbound payload
- `src/utils/response.js` - switches to translation-backed error resolution
- `src/utils/i18n.js` - new locale loader and translation resolver
- `src/locales/en.json` - English error strings
- `src/locales/zh.json` - Traditional Chinese error strings
- `__tests__/test-petinfobypetnumber.test.js` - asserts the narrowed payload contract and explicit projection
- `CHANGELOG.md` - this entry

### Security Impact

- High finding fixed: the public response no longer returns internal identifiers (`_id`, `userId`, `ngoId`, `ngoPetId`) that are unnecessary for tag-based lookups.
- High finding fixed: the public route no longer returns differential `404` vs rich-success responses for missing vs existing `tagId` values.
- High finding fixed: the public payload is now limited to non-sensitive pet profile fields and no longer includes `owner`, `tagId`, `isRegistered`, `createdAt`, or `updatedAt`.
- Medium finding fixed: the DB read now uses an explicit allowlist projection so newly added schema fields are not implicitly loaded into the lambda.
- Low finding fixed: error responses now follow the repo's translation-loading pattern instead of a lambda-local hardcoded error map.

### Deferred Risk Classification

- Deferred: the route remains intentionally public by `tagId`, so abuse resistance still depends partly on the entropy and operational handling of tag identifiers rather than authentication.

### Verification

- `npx jest --runInBand __tests__/test-petinfobypetnumber.test.js --no-coverage`
- Result: `6 passed`

### Result Of This Stage

PetInfoByPetNumber now matches the Tier 3 baseline more closely: it performs a focused read, returns a narrower public payload, uses translation-backed errors, and has an auditable changelog entry for the hardening work.
