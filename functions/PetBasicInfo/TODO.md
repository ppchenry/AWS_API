# PetBasicInfo TODO

## Tomorrow

- Implement real route dispatch in `src/router.js` using normalized route keys for:
  - `GET /basic-info`
  - `PUT /basic-info`
  - `GET /eyeLog`
  - `DELETE /`
- Create service files under `src/services/` for the current route branches from `index.js`.
- Move the old `GET /basic-info` branch from `index.js` into a service function first.
- Add a standardized success response helper in `src/utils/response.js` so services can return consistent payloads.
- Update router handlers to call service functions and return their responses directly.
- Keep `handler.js` thin: setup, translations, guards, router call, global catch only.
- Decide whether `authJWT` should run globally in `handler.js` or per protected route in `router.js`.

## After First Route Move

- Move `PUT /basic-info` logic into a service file without changing behavior.
- Move `GET /eyeLog` logic into a service file.
- Move soft-delete logic into a service file.
- Remove dead code and temporary duplication from `index.js` once each route is working in `src/`.

## Cleanup Later

- Standardize success and error response shapes in `src/utils/response.js`.
- Review CORS handling for consistency across all responses.
- Revisit auth enforcement and sensitive logging after the structure refactor is complete.
- Extract only truly stable shared helpers into `shared/` after comparing multiple Lambdas.
