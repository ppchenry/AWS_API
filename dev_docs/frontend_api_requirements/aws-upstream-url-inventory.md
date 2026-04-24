# AWS Upstream URL Inventory (Code-Verified)

## Verification Date
- 2026-04-23

## Source of Truth
- Scope scanned: `src/**`, `server/**`, `.env`, `.env.production`
- Docs policy: existing `docs/**` content was not used as factual source for this inventory.
- Commands used:
  - `rg -n "AWS_BASE_URL|AWS_BUCKET_BASE_URL|execute-api|amazonaws\\.com" server src .env .env.production`
  - `rg -n "\\$\\{AWS_BASE_URL\\}/" server/index.ts`
  - `nl -ba server/index.ts | sed -n '<range>p'` (for line-accurate evidence)

## AWS Base Values
- `AWS_API_BASE`
  - `.env`: `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production`
  - `.env.production`: `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production`
- `AWS_BUCKET_BASE_URL`
  - `.env`: `https://petpetclub.s3.ap-southeast-1.amazonaws.com`
  - `.env.production`: not present

## Resolved AWS URL Inventory

| # | AWS URL | Method | Dynamic Path | Trigger Entry (BFF) | Code Evidence |
|---|---|---|---|---|---|
| 1 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/animal/breed/{species}/en` | `GET` | `{species}` | Startup preload + `GET /api/breeds/:species` cache refresh path | `server/index.ts:586`, `server/index.ts:2304` |
| 2 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/animal/breed/{species}/zh` | `GET` | `{species}` | Startup preload + `GET /api/breeds/:species` cache refresh path | `server/index.ts:589`, `server/index.ts:2304` |
| 3 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/generate-sms-code` | `POST` | None | `POST /api/generate-sms` | `server/index.ts:908`, `server/index.ts:895` |
| 4 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/verify-sms-code` | `POST` | None | `POST /api/verify-sms`, `POST /api/account/verify-sms-code` | `server/index.ts:948`, `server/index.ts:1033` |
| 5 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/auth/refresh` | `POST` | None | `POST /api/auth/refresh` | `server/index.ts:1191`, `server/index.ts:1180` |
| 6 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/generate-email-code` | `POST` | None | `POST /api/generate-email` | `server/index.ts:1518`, `server/index.ts:1509` |
| 7 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/verify-email-code` | `POST` | None | `POST /api/account/verify-email-code`, `POST /api/verify-email` | `server/index.ts:1566`, `server/index.ts:1603` |
| 8 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/create-pet-basic-info-with-image` | `POST` | None | `POST /api/pets/create-basic-info` | `server/index.ts:2360`, `server/index.ts:2343` |
| 9 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/pet-list/{userId}` | `GET` | `{userId}` | `GET /api/pets/list/:userId` | `server/index.ts:2387`, `server/index.ts:2383` |
| 10 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}/basic-info` | `PUT` | `{petId}` | `PUT /api/pets/:petId/update-basic-info` | `server/index.ts:2408`, `server/index.ts:2404` |
| 11 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/register-by-email` | `POST` | None | `POST /api/account/register-by-email`, `POST /api/account/register-email` | `server/index.ts:2433`, `server/index.ts:2482` |
| 12 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/register` | `POST` | None | `POST /api/account/register` | `server/index.ts:2457`, `server/index.ts:2455` |
| 13 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/register-by-phoneNumber` | `POST` | None | `POST /api/account/register-phone`, `POST /api/account/register-by-phoneNumber` | `server/index.ts:2507`, `server/index.ts:2531` |
| 14 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/register-email-2` | `POST` | None | `POST /api/account/register-email-2` | `server/index.ts:2556`, `server/index.ts:2554` |
| 15 | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account` | `PUT` | None | `PUT /api/account/update-user` | `server/index.ts:2581`, `server/index.ts:2579` |
| 16 | `https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/breed_analysis/{userId}/{uuid}.{ext}` | `PUT` (upload), `GET` (public object access) | `{userId}`, `{uuid}`, `{ext}` | `POST /api/upload/image`, `POST /api/upload/sign` | `server/index.ts:62`, `server/index.ts:769`, `server/index.ts:824` |

## Coverage Notes
- Startup-triggered AWS calls:
  - Breed cache warm-up (`hydrateBreedCacheOnStart`) will call URL #1 and #2 during server startup for prefetch species.
- Request-triggered AWS calls:
  - URL #3 to #16 are triggered when corresponding BFF routes are called.
- Exclusions (explicit):
  - Non-AWS upstream URL: `http://ppcapi.ddns.net:8001/predict` (`server/index.ts:2613`)
  - Internal local routes: all `/api/*` BFF endpoints
  - Historical/archived docs URLs under `docs/archive/**`

## URL-Type Env Coverage Check
- URL-type envs discovered from code paths: `AWS_API_BASE`, `AWS_BUCKET_BASE_URL`
- Env URL values present but not used by runtime URL construction: none
