- [ ] add location param to ngo pet list query

---

## Postman Dev Smoke Tests (added 2026-04-23)

### Automated (Postman CLI)

Two happy-path collections live under `postman/` and run against the Dev API
Gateway. JWTs for `user`, `admin`, and `ngo` roles are minted **inside the
collection pre-request script** using the shared HS256 `JWT_SECRET` (default
`PPCSecret`, see [env.json](../env.json)), so no email / SMS / login
round-trip is required.

**Run everything:**

```bash
./postman/run-dev-happy-path.sh            # both suites
./postman/run-dev-happy-path.sh public     # public only
./postman/run-dev-happy-path.sh auth       # authenticated only
./postman/run-dev-happy-path.sh auth --verbose
```

Reads `DEV_BASE_URL` / `DEV_API_KEY` / `JWT_SECRET` from repo-root `.env`
(see `example.env`).

**Coverage (all ✅ passing):**

| Suite | Requests | Highlights |
| --- | --- | --- |
| `dev-happy-path.postman_collection.json` (public) | 6 | `/purchase/shop-info`, `/adoption` list + detail + filters, `/pets/pet-list-ngo/{ngoId}` (+ search/sort) |
| `dev-happy-path-auth.postman_collection.json` (authenticated) | 27 | `/account/{userId}`, `/pets/pet-list/{userId}`, `/pets/{id}/basic-info`, `/pets/{id}/eyeLog`, `/pets/{id}/detail-info`, `/v2/pets/{id}/detail-info/source`, `/v2/pets/{id}/pet-adoption`, medical / medication / deworm / vaccine / blood-test record GETs, `/petBiometrics/{id}`, `/v2/account/{id}/notifications` GET/POST/PUT(archive), admin `/purchase/orders`, `/purchase/order-verification`, `/v2/orderVerification/getAllOrders`, + a full pet CREATE→DELETE cycle |
| Pet CREATE → DELETE cycle (inside auth suite) | 8 | `POST /pets/create-pet-basic-info` → `PUT /pets/{id}/basic-info` → `POST /pets/{id}/detail-info` → `POST/DELETE /pets/{id}/medical-record` → `POST/DELETE /v2/pets/{id}/pet-adoption` → `DELETE /pets/{id}` cleanup |

**How token minting works:** see the collection-level pre-request script in
`postman/dev-happy-path-auth.postman_collection.json` — uses `crypto-js`
HMAC-SHA256 to sign `{ userId, userEmail, userRole, [ngoId,] iat, exp }`
against `{{JWT_SECRET}}`. Fixed user IDs come from
`TEST_OWNER_USER_ID` / `TEST_PET_ID` / `TEST_NGO_ID` in [env.json](../env.json).

### Manual Postman testing required

Only the items below truly **cannot** be exercised by the automated runner
(they need a real inbox / phone number, multipart file uploads, live
third-party services, destructive state, or an NGO user whose DB `role`
field is `ngo`).

#### Verification-first auth — AUTH_FLOW_API.md

- [ ] `POST /account/generate-email-code` (requires a real inbox; rate-limited)
- [ ] `POST /account/generate-sms-code` (Twilio Verify on a real phone)
- [ ] `POST /account/verify-email-code` (needs the 6-digit code from the email)
- [ ] `POST /account/verify-sms-code` (needs SMS code)
- [ ] `POST /account/register` (requires verification proof ≤10 min old — creates a real user)
- [ ] `POST /auth/refresh` (needs a valid `refreshToken` cookie; set `DEV_REFRESH_TOKEN` in `.env` and run via Postman desktop)
- [ ] `POST /account/register-ngo` (NGO_ADMIN_API.md — creates NGO + admin user; unique email/phone/BR#; 8/10min per IP)

#### NGO-role endpoints — NGO_ADMIN_API.md

Require the caller's **DB** user record to have `role: "ngo"` (the minted
NGO token is accepted at the JWT layer but rejected by the Lambda's
DB-side role check). `/account/edit-ngo/*` paths additionally sit behind
a separate API Gateway authorizer and must be exercised from Postman
desktop.

- [ ] `GET /account/user-list`
- [ ] `GET /account/edit-ngo/{ngoId}`
- [ ] `PUT /account/edit-ngo/{ngoId}` (transactional; uniqueness on email/phone/regNumber)
- [ ] `GET /account/edit-ngo/{ngoId}/pet-placement-options`
- [ ] `PUT /pets/{petID}/detail-info/NGOtransfer` (role=`ngo`; target user must exist by email **and** phone)

#### Destructive / state-mutating user endpoints — ACCOUNT_API.md

- [ ] `PUT /account` (collides with existing email/phone — use a throw-away user)
- [ ] `DELETE /account/{userId}` (soft-deletes the caller; revokes refresh tokens)
- [ ] `POST /account/delete-user-with-email` (destructive)
- [ ] `POST /account/update-image` (needs a valid image URL; side-effect on user profile)

#### Multipart / file-upload flows — PET_LOST_FOUND_API.md + MEDIA_UPLOAD_API.md

- [ ] `GET /pets/pet-lost` — ⚠ returns 405 on Dev stage (only POST + DELETE deployed). Deployment gap — track in a separate issue.
- [ ] `POST /pets/pet-lost` (multipart `files[]`)
- [ ] `DELETE /pets/pet-lost/{petLostID}`
- [ ] `GET /pets/pet-found` — ⚠ also 405 on Dev (same cause as above).
- [ ] `POST /pets/pet-found` (multipart)
- [ ] `DELETE /pets/pet-found/{petFoundID}`
- [ ] `POST /util/uploadImage` (multipart JPEG/PNG)
- [ ] `POST /util/uploadPetBreedImage` (multipart + `url` folder allowlist)
- [ ] `POST /pets/create-pet-basic-info-with-image` (multipart)
- [ ] `POST /pets/updatePetImage` (multipart + `removedIndices` JSON)

#### External-service flows — MEDIA_UPLOAD_API.md + PET_BIOMETRICS_API.md

- [ ] `POST /analysis/eye-upload/{petId}` (external eye-analysis + heatmap services)
- [ ] `POST /analysis/breed` (external breed classifier)
- [ ] `POST /petBiometrics/register` (needs 5 HTTPS URLs for face arrays)
- [ ] `POST /petBiometrics/verifyPet` (needs `access_secret`/`secret_key` for a `UserBusiness`; calls FaceID provider)
- [ ] `PUT /pets/updatePetEye` (needs real left/right eye image URLs)
- [ ] `GET /pets/getPetInfobyTagId/{tagId}` — public but requires a real tagId; once known, lift into the public collection

#### SF Express — SF_EXPRESS_API.md (all hit the live SF API)

- [ ] `POST /sf-express-routes/create-order` (creates a real SF waybill — only run with sandbox credentials)
- [ ] `POST /sf-express-routes/get-token`
- [ ] `POST /sf-express-routes/get-area`
- [ ] `POST /sf-express-routes/get-netCode`
- [ ] `POST /sf-express-routes/get-pickup-locations`
- [ ] `POST /v2/sf-express-routes/print-cloud-waybill` (SF cloud-print + SMTP email)

#### Purchase / Order verification — PURCHASE_ORDER_API.md

- [ ] `POST /purchase/confirmation` (public but multipart; unique `tempId`; 10/3600s per IP — creates a real Order)
- [ ] `DELETE /purchase/order-verification/{orderVerificationId}` (admin; destructive)
- [ ] `POST /purchase/send-ptag-detection-email` (admin; sends real email)
- [ ] `GET /v2/orderVerification/supplier/{orderId}` (supplier/owner — caller's email must match `masterEmail` or linked `Order.email`)
- [ ] `PUT /v2/orderVerification/supplier/{orderId}` (multipart or JSON)
- [ ] `GET /v2/orderVerification/whatsapp-order-link/{_id}` (admin/owner)
- [ ] `GET /v2/orderVerification/ordersInfo/{tempId}` (owner)
- [ ] `GET /v2/orderVerification/{tagId}` (needs a real `tagId`)
- [ ] `PUT /v2/orderVerification/{tagId}` (may dispatch WhatsApp)
