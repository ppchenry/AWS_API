# UserRoutes API Refactor Proposal

## Goal

Normalize the current `UserRoutes` API into clearer resource-oriented paths so routing, authorization, validation, documentation, and integration testing become simpler and less error-prone.

This proposal does **not** assume an immediate breaking rewrite. The preferred rollout is additive first, then deprecate the old paths after frontend and consumer migration.

## Current Problems

The current route set mixes multiple concerns under `/account`:

- self-service account operations
- admin-style user lookups
- authentication workflows
- SMS verification workflows
- NGO resource management

The current paths are closer to RPC commands than resource-oriented HTTP design.

Examples:

- `POST /account/login-2`
- `POST /account/generate-sms-code`
- `POST /account/verify-sms-code`
- `POST /account/register-ngo`
- `GET /account/user-list`
- `GET /account/edit-ngo/{ngoId}`
- `PUT /account/update-password`
- `POST /account/delete-user-with-email`

This creates several concrete problems:

- path names expose implementation history instead of domain meaning
- one resource prefix is overloaded with unrelated concerns
- some operations pass identity in the body when path params or JWT context should own it
- route intent is harder to infer for new developers and API consumers
- documentation and integration tests are harder to organize cleanly

## Design Principles

The refactor should follow these rules:

1. Use resource nouns for long-lived domain entities.
2. Use sub-resources for focused updates like password or profile image.
3. Keep authentication and verification workflows under an auth-oriented namespace.
4. Use singular `/account` only for the authenticated caller's own account.
5. Use plural resources like `/users` and `/ngos` for collection and entity access.
6. Use path params for resource identity and query params for collection filtering.
7. Do not force every workflow into CRUD if it is semantically an action-oriented authentication flow.

## Proposed Resource Model

### 1. Current authenticated user

Use `/account` for self-service operations derived from JWT identity.

- `GET /account`
- `PATCH /account`
- `DELETE /account`
- `PATCH /account/password`
- `PATCH /account/image`

Notes:

- These routes should not require `userId` in the request body.
- The server should resolve the acting user from the authenticated token.

### 2. User resources

Use `/users` for user resource creation, lookup, and management.

- `POST /users`
- `GET /users`
- `GET /users/{userId}`
- `PATCH /users/{userId}`
- `DELETE /users/{userId}`

Notes:

- `GET /users` should support query parameters like `page`, `search`, `email`, `phone`, or role-specific filters.
- Collection filtering belongs in query params.
- Individual identity belongs in path params.

### 3. Authentication and verification workflows

Use `/auth` for login and verification steps.

- `POST /auth/login`
- `POST /auth/sms-codes`
- `POST /auth/sms-codes/verify`
- optional: `POST /auth/identity-check`

Notes:

- `login-2` should not survive as a public contract name.
- If `checkUserExists` is still required by frontend flow, rename it to something explicit like `identity-check`.
- If it is not required, remove it and let login be the only entry point.

### 4. NGO resources

Use `/ngos` as the NGO resource boundary.

- `POST /ngos`
- `GET /ngos/{ngoId}`
- `PATCH /ngos/{ngoId}`
- `GET /ngos/{ngoId}/users`
- `GET /ngos/{ngoId}/pet-placement-options`

Optional if needed:

- `GET /ngos/{ngoId}/stats`
- `GET /ngos`

Notes:

- NGO-specific collections and derived data should live under the NGO resource tree.
- This is cleaner than returning NGO-specific user data from `/account/user-list`.

## Current-to-Proposed Route Mapping

| Current route | Proposed route | Notes |
| --- | --- | --- |
| `PUT /account` | `PATCH /account` | Self-service account update. Use JWT identity instead of requiring `userId` in body where possible. |
| `GET /account/{userId}` | `GET /users/{userId}` | Cross-user resource lookup should be under `/users`. |
| `DELETE /account/{userId}` | `DELETE /users/{userId}` | Same resource rule as above. |
| `POST /account/login` | `POST /auth/login` | Auth workflow, not account resource CRUD. |
| `POST /account/login-2` | `POST /auth/identity-check` or remove | Rename or eliminate implementation-history naming. |
| `POST /account/generate-sms-code` | `POST /auth/sms-codes` | Create a verification challenge. |
| `POST /account/verify-sms-code` | `POST /auth/sms-codes/verify` | Verify the submitted SMS challenge. |
| `POST /account/register` | `POST /users` | Creates a user resource. |
| `PUT /account/update-password` | `PATCH /account/password` | Password is a sub-resource of the authenticated account. |
| `POST /account/update-image` | `PATCH /account/image` | Profile image is a sub-resource. |
| `POST /account/delete-user-with-email` | remove or replace with `DELETE /users/{userId}` | Email-based delete is operationally awkward and less resource-oriented. |
| `POST /account/register-ngo` | `POST /ngos` or `POST /ngo-registrations` | Use `/ngos` if this creates the NGO directly. Use `/ngo-registrations` if it is approval-driven onboarding. |
| `GET /account/user-list` | `GET /ngos/{ngoId}/users` or `GET /users` | Depends on whether the list is NGO-scoped or globally filterable. |
| `GET /account/edit-ngo/{ngoId}` | `GET /ngos/{ngoId}` | Resource read. |
| `PUT /account/edit-ngo/{ngoId}` | `PATCH /ngos/{ngoId}` | Resource update. |
| `GET /account/edit-ngo/{ngoId}/pet-placement-options` | `GET /ngos/{ngoId}/pet-placement-options` | NGO sub-resource. |

## Specific Recommendation for `checkUserExists`

`checkUserExists` should **not** be merged into `getUserDetails`.

Reason:

- `getUserDetails` is a user resource read
- `checkUserExists` is a pre-auth workflow step
- they have different security and authorization expectations

Recommended options:

1. Remove it if frontend can rely on `POST /auth/login` result alone.
2. Keep it only as `POST /auth/identity-check` with a minimal response.

If kept, it should be reviewed for account enumeration risk.

## Recommendation for NGO User List

The current NGO-related list behavior should be split by responsibility if the existing endpoint is doing too much.

Preferred split:

- `GET /ngos/{ngoId}`
- `GET /ngos/{ngoId}/users`
- `GET /ngos/{ngoId}/pet-placement-options`

Optional if extra metadata is currently coupled into the list response:

- `GET /ngos/{ngoId}/stats`

Benefits:

- clearer authorization rules
- simpler service logic
- easier integration testing
- smaller response contracts with less accidental coupling

## Why This Refactor Helps

This change would improve:

### Maintainability

- clearer route intent
- less special-case routing logic
- easier onboarding for developers

### Security

- cleaner separation between public auth flows and protected resource reads
- fewer endpoints that rely on identity passed through bodies
- easier authorization reasoning per resource tree

### Testing

- more predictable path structure
- easier grouping of integration tests by domain
- simpler happy-path and failure-path coverage

### Documentation

- easier API docs for frontend and mobile consumers
- reduced confusion around deprecated historical names like `login-2` and `edit-ngo`

## Migration Strategy

Recommended rollout:

1. Add the new routes without removing the old ones.
2. Keep the old handlers delegating internally to the same service logic where possible.
3. Mark old paths as deprecated in API docs and changelog.
4. Update frontend or downstream consumers incrementally.
5. Add integration tests for both old and new paths during migration.
6. Remove deprecated paths only after consumer migration is confirmed.

## Questions to Confirm with Manager

Before implementation, confirm:

1. Is backward compatibility required?
2. Can frontend or app consumers adopt new paths in phases?
3. Should `checkUserExists` remain public or be removed?
4. Is NGO registration a direct create flow or an approval workflow?
5. Is `user-list` NGO-scoped or intended to evolve into a broader user query API?

## Recommended First Phase

If only a limited cleanup is approved, the highest-value first phase is:

1. move auth routes under `/auth`
2. rename NGO routes under `/ngos/{ngoId}`
3. replace `login-2` with either `identity-check` or removal
4. split `user-list` into a clearly scoped NGO users endpoint

This delivers most of the clarity benefit without requiring an all-at-once rewrite.