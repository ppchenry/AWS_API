# Postman Happy Path Test Report (Dev)

Date: 2026-04-23  
Environment: `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`  
Runner: `./postman/run-dev-happy-path.sh --verbose`

## 1) Automated Execution Result

- Public smoke suite: 6 requests, 20 assertions, 0 failed
- Authenticated smoke suite: 60 requests, 152 assertions, 0 failed
- Total automated run: 66 requests, 172 assertions, 0 failed
- API-doc route check: 98 documented endpoints, 0 returned 405, 0 missing gateway routes

Conclusion: current Postman happy-path automation run passed fully.

## 2) Manual Auth Flow Result

The following auth-flow endpoints were tested manually on 2026-04-23 and passed:

- `POST /account/generate-email-code`
- `POST /account/generate-sms-code`
- `POST /account/verify-email-code`
- `POST /account/verify-sms-code`
- `POST /account/register`
- `POST /auth/refresh`

## 3) Coverage Summary vs `dev_docs/api_docs`

- Documented unique endpoints: 98
- Auto-tested by current Postman happy-path collections: 64
- Manually tested and passed (auth flow): 6
- Total validated now (auto + manual): 70
- Remaining not yet automated in this happy-path suite: 28

## 4) Remaining Not Auto-Tested and Why

These endpoints are not in the current happy-path automation by design. The suite focuses on deterministic, low-risk smoke validation and avoids high-side-effect or fixture-heavy flows.

### Remaining GET Endpoints (Explicit)

The following non-automated `GET` endpoints are intentionally left out of the current smoke suite and are mostly fixture-dependent. If stable IDs are provided, they can be added to a separate deterministic suite.

| GET endpoint | Fixture IDs / tokens needed to automate |
| --- | --- |
| `GET /v2/account/user-list` | NGO access token (`ngo` role) |
| `GET /v2/account/edit-ngo/{ngoId}` | `ngoId` + matching NGO access token |
| `GET /v2/account/edit-ngo/{ngoId}/pet-placement-options` | `ngoId` + matching NGO access token |
| `GET /v2/pets/pet-lost` | Optional: stable seeded lost-post IDs for deterministic assertions |
| `GET /v2/pets/pet-found` | Optional: stable seeded found-post IDs for deterministic assertions |
| `GET /pets/getPetInfobyTagId/{tagId}` | Stable `tagId` with known expected payload |

| Endpoint | Why not auto-tested in current happy-path suite |
| --- | --- |
| `DELETE /account/{userId}` | Destructive account removal on shared Dev data; unsafe for routine smoke runs. |
| `POST /account/delete-user-with-email` | Same destructive account lifecycle risk; can invalidate shared test users. |
| `DELETE /purchase/order-verification/{orderVerificationId}` | Destructive on order-verification records; not suitable for always-on smoke runs. |
| `POST /purchase/confirmation` | Creates real purchase/order records; high data side effects and cleanup complexity. |
| `POST /purchase/send-ptag-detection-email` | Triggers outbound email side effects; can spam real recipients. |
| `GET /v2/pets/pet-lost` | Public board data is noisy and non-deterministic; assertions become flaky without stable seeded fixtures. |
| `POST /v2/pets/pet-lost` | Creates public lost posts in shared env; persistent data side effects. |
| `DELETE /v2/pets/pet-lost/{petLostID}` | Destructive cleanup on shared lost-post data; requires strict ownership fixture control. |
| `GET /v2/pets/pet-found` | Public board data is noisy and non-deterministic; assertions become flaky without stable seeded fixtures. |
| `POST /v2/pets/pet-found` | Creates public found posts in shared env; persistent data side effects. |
| `DELETE /v2/pets/pet-found/{petFoundID}` | Destructive cleanup on shared found-post data; requires strict ownership fixture control. |
| `POST /util/uploadImage` | Multipart file upload requires binary fixture management and S3 side-effect cleanup. |
| `POST /util/uploadPetBreedImage` | Multipart upload with allowlist/path constraints; requires stable fixture files. |
| `POST /pets/create-pet-basic-info-with-image` | Multi-part create + upload flow; higher flake risk and storage side effects. |
| `POST /pets/updatePetImage` | Multi-part update with image lifecycle behavior; harder deterministic assertions. |
| `POST /analysis/eye-upload/{petId}` | Vision pipeline call with heavier processing and file upload dependency. |
| `POST /analysis/breed` | Model/inference style response can vary; lower determinism for smoke assertions. |
| `POST /petBiometrics/register` | Biometric enrollment is stateful and image-dependent; requires dedicated fixture images. |
| `POST /petBiometrics/verifyPet` | Depends on enrolled biometric state and image quality; prone to environment variance. |
| `POST /sf-express-routes/get-token` | External SF integration dependency; token behavior is outside local API control. |
| `POST /sf-express-routes/get-area` | External SF API dependency; can fail due upstream/network/account status. |
| `POST /sf-express-routes/get-netCode` | External SF API dependency; requires stable type/area fixture pairs. |
| `POST /sf-express-routes/get-pickup-locations` | External SF API dependency plus variable location data. |
| `POST /sf-express-routes/create-order` | Real logistics side effects (waybill/order generation); not smoke-safe. |
| `POST /v2/sf-express-routes/print-cloud-waybill` | External print/email side effects; not appropriate for routine automation. |
| `POST /v2/account/register-ngo` | Creates new org + user state; high fixture and cleanup burden in shared env. |
| `GET /v2/account/user-list` | Requires dedicated NGO-role auth fixture (token not in default smoke set). |
| `GET /v2/account/edit-ngo/{ngoId}` | Requires stable `ngoId` fixture and matching NGO-role token. |
| `GET /v2/account/edit-ngo/{ngoId}/pet-placement-options` | Requires stable `ngoId` fixture and matching NGO-role token. |
| `PUT /v2/account/edit-ngo/{ngoId}` | Mutates NGO profile data; high side effects in shared environment. |
| `PUT /pets/{petID}/detail-info/NGOtransfer` | Business-critical ownership transfer mutation; intentionally excluded from smoke. |
| `POST /pets/deletePet` | Legacy delete path; coverage prioritized on canonical `DELETE /pets/{petID}` flow. |
| `PUT /pets/updatePetEye` | Legacy/specialized update path; lower priority than canonical pet update flows. |
| `GET /pets/getPetInfobyTagId/{tagId}` | Requires stable public `tagId` fixture with known expected shape for deterministic assertions. |

## 5) Notes

- "Not auto-tested" here means "not included in the current happy-path Postman suite", not "impossible to automate".
- Most remaining endpoints can be automated in a separate non-smoke suite with isolated fixtures, stronger cleanup, and explicit side-effect controls.
