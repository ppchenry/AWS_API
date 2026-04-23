# Refactored Lambda Endpoint Status By Domain

Date reviewed: 2026-04-23

This report reviews the Lambda entries listed under **Already Refactored** in `dev_docs/LAMBDA_REFACTOR_INVENTORY.md`.

This is an endpoint inventory for future domain API docs. It follows the domain-first style used by `dev_docs/api_docs/AUTH_FLOW_API.md`, but it is not a full request/response API spec.

Sources reviewed:

- `template.yaml` API Gateway events
- `functions/<Lambda>/src/router.js`
- `functions/<Lambda>/src/handler.js` where the Lambda dispatches directly from a handler route key
- Service implementations under `functions/<Lambda>/src/services/` where the route name was ambiguous or misleading

Classification rules:

- **Active**: the non-`OPTIONS` endpoint is declared in `template.yaml` and is handled by an exact router key or a handler `ROUTE_KEY`.
- **Dead**: the non-`OPTIONS` endpoint is explicitly mapped to `null`, or it is declared in `template.yaml` but has no matching router/handler route key and falls through to 405.
- **Dead ghost**: a dead router entry that is not exposed by the current SAM template.
- `OPTIONS` CORS preflight routes are intentionally excluded.

Note: legacy duplicate or alias routes may still exist in SAM/API Gateway due to infrastructure history. The active API contract is the exact router/handler route set documented in `dev_docs/api_docs`.

## Summary

Total non-`OPTIONS` endpoints reviewed: 125

Dead endpoints still declared in SAM: 17

Dead ghost router entries not declared in SAM: 10

Duplicate-looking dead rows can represent different Lambda/SAM/router entries for the same path.

## Active Endpoints

### Auth And Account Lifecycle

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /account/generate-email-code` | `EmailVerification` | Sends a 6-digit email verification code. Used by registration, login, and email-linking flows. |
| `POST /account/verify-email-code` | `EmailVerification` | Verifies an email code. Returns new-user proof, logs in an existing user, or links email to an authenticated user. |
| `POST /account/generate-sms-code` | `UserRoutes` | Sends an SMS verification code via Twilio Verify. Used by registration, login, and phone-linking flows. |
| `POST /account/verify-sms-code` | `UserRoutes` | Verifies an SMS code. Returns new-user proof, logs in an existing user, or links phone to an authenticated user. |
| `POST /account/register` | `UserRoutes` | Creates a verified user account after recent email/SMS proof, then issues access and refresh tokens. |
| `POST /auth/refresh` | `AuthRoute` | Rotates the refresh-token cookie and returns a new access token. |
| `PUT /account` | `UserRoutes` | Updates account profile fields such as name, email, phone, birthday, district, and image after self-access and duplicate checks. |
| `GET /account/{userId}` | `UserRoutes` | Returns a sanitized active user profile by user ID. |
| `DELETE /account/{userId}` | `UserRoutes` | Soft-deletes a user and revokes their refresh tokens. |
| `POST /account/delete-user-with-email` | `UserRoutes` | Soft-deletes a user found by email and revokes their refresh tokens. |
| `POST /account/update-image` | `UserRoutes` | Updates the authenticated user's profile image URL. |

### NGO Administration

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /v2/account/register-ngo` | `UserRoutes` | Creates an NGO admin user, NGO profile, NGO access record, and NGO counter in one transaction, then issues tokens. |
| `GET /v2/account/user-list` | `UserRoutes` | Lists NGO users with search and pagination through an aggregation pipeline. |
| `GET /v2/account/edit-ngo/{ngoId}` | `UserRoutes` | Returns NGO profile, linked user profile, access settings, and NGO counter data for editing. |
| `PUT /v2/account/edit-ngo/{ngoId}` | `UserRoutes` | Updates NGO profile, NGO admin user fields, counters, and access settings in a transaction. |
| `GET /v2/account/edit-ngo/{ngoId}/pet-placement-options` | `UserRoutes` | Returns configured pet placement options for an NGO. |

### Pet Profile And Ownership

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /pets/create-pet-basic-info` | `CreatePetBasicInfo` | Creates a pet owned by the authenticated user from JSON body data. Validates duplicate tag IDs. |
| `POST /pets/create-pet-basic-info-with-image` | `EyeUpload` | Creates a pet from multipart form data and uploaded images. Uses JWT identity for ownership and supports NGO pet ID generation. |
| `GET /pets/getPetInfobyTagId/{tagId}` | `PetInfoByPetNumber` | Public tag lookup that returns a limited pet profile projection by tag ID. |
| `GET /pets/pet-list/{userId}` | `GetAllPets` | Lists pets for a user. |
| `GET /pets/pet-list-ngo/{ngoId}` | `GetAllPets` | Lists pets associated with an NGO. |
| `GET /pets/{petID}/basic-info` | `PetBasicInfo` | Returns basic pet profile fields for an authorized pet. |
| `PUT /pets/{petID}/basic-info` | `PetBasicInfo` | Updates editable basic pet profile fields for an authorized pet. |
| `DELETE /pets/{petID}` | `PetBasicInfo` | Soft-deletes an authorized pet and clears its tag ID. |
| `POST /pets/deletePet` | `GetAllPets` | Legacy-style soft delete by body `petId`, guarded by ownership and deletion state checks. |
| `POST /pets/updatePetImage` | `EyeUpload` | Updates pet images and scalar pet profile fields from multipart form data after owner/NGO access checks. |
| `GET /pets/{petID}/detail-info` | `PetDetailInfo` | Returns detailed pet information for an authorized pet. |
| `POST /pets/{petID}/detail-info` | `PetDetailInfo` | Updates detailed pet fields such as owner, status, dates, source-like metadata, and notes. |
| `POST /pets/{petID}/detail-info/transfer` | `PetDetailInfo` | Adds an owner-transfer record to a pet. |
| `PUT /pets/{petID}/detail-info/transfer/{transferId}` | `PetDetailInfo` | Updates a specific owner-transfer record. |
| `DELETE /pets/{petID}/detail-info/transfer/{transferId}` | `PetDetailInfo` | Removes a specific owner-transfer record. |
| `PUT /pets/{petID}/detail-info/NGOtransfer` | `PetDetailInfo` | Transfers or assigns NGO-related ownership/contact data on a pet after target-user validation. |
| `GET /v2/pets/{petID}/detail-info/source` | `PetDetailInfo` | Returns source/origin records attached to a pet. |
| `POST /v2/pets/{petID}/detail-info/source` | `PetDetailInfo` | Creates a pet source/origin record, rejecting duplicates. |
| `PUT /v2/pets/{petID}/detail-info/source/{sourceId}` | `PetDetailInfo` | Updates a specific pet source/origin record. |

### Pet Adoption

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /v2/pets/{petID}/pet-adoption` | `PetDetailInfo` | Returns adoption placement records linked to an owned pet. |
| `POST /v2/pets/{petID}/pet-adoption` | `PetDetailInfo` | Creates an adoption placement record for an owned pet. |
| `PUT /v2/pets/{petID}/pet-adoption/{adoptionId}` | `PetDetailInfo` | Updates an adoption placement record. |
| `DELETE /v2/pets/{petID}/pet-adoption/{adoptionId}` | `PetDetailInfo` | Deletes an adoption placement record. |
| `GET /adoption` | `GetAdoption` | Public adoption browsing list with filters, search, pagination, and excluded-source filtering. |
| `GET /adoption/{id}` | `GetAdoption` | Public adoption detail lookup by adoption pet ID. |

### Pet Health And Clinical Records

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /pets/{petID}/eyeLog` | `PetBasicInfo` | Returns saved eye analysis logs for a pet. |
| `PUT /pets/updatePetEye` | `GetAllPets` | Appends left/right eye image URLs and date to a pet after ownership checks. |
| `GET /pets/{petID}/medical-record` | `PetMedicalRecord` | Lists medical records for a pet. |
| `POST /pets/{petID}/medical-record` | `PetMedicalRecord` | Creates a medical record for a pet. |
| `PUT /pets/{petID}/medical-record/{medicalID}` | `PetMedicalRecord` | Updates a medical record. |
| `DELETE /pets/{petID}/medical-record/{medicalID}` | `PetMedicalRecord` | Deletes a medical record. |
| `GET /pets/{petID}/medication-record` | `PetMedicalRecord` | Lists medication records for a pet. |
| `POST /pets/{petID}/medication-record` | `PetMedicalRecord` | Creates a medication record for a pet. |
| `PUT /pets/{petID}/medication-record/{medicationID}` | `PetMedicalRecord` | Updates a medication record. |
| `DELETE /pets/{petID}/medication-record/{medicationID}` | `PetMedicalRecord` | Deletes a medication record. |
| `GET /pets/{petID}/deworm-record` | `PetMedicalRecord` | Lists deworming records for a pet. |
| `POST /pets/{petID}/deworm-record` | `PetMedicalRecord` | Creates a deworming record for a pet. |
| `PUT /pets/{petID}/deworm-record/{dewormID}` | `PetMedicalRecord` | Updates a deworming record. |
| `DELETE /pets/{petID}/deworm-record/{dewormID}` | `PetMedicalRecord` | Deletes a deworming record. |
| `GET /v2/pets/{petID}/blood-test-record` | `PetMedicalRecord` | Lists blood test records for a pet. |
| `POST /v2/pets/{petID}/blood-test-record` | `PetMedicalRecord` | Creates a blood test record and syncs pet summary fields where applicable. |
| `PUT /v2/pets/{petID}/blood-test-record/{bloodTestID}` | `PetMedicalRecord` | Updates a blood test record and syncs pet summary fields where applicable. |
| `DELETE /v2/pets/{petID}/blood-test-record/{bloodTestID}` | `PetMedicalRecord` | Deletes a blood test record. |
| `GET /pets/{petID}/vaccine-record` | `PetVaccineRecords` | Lists vaccine records for a pet. |
| `POST /pets/{petID}/vaccine-record` | `PetVaccineRecords` | Creates a vaccine record for a pet. |
| `PUT /pets/{petID}/vaccine-record/{vaccineID}` | `PetVaccineRecords` | Updates a vaccine record. |
| `DELETE /pets/{petID}/vaccine-record/{vaccineID}` | `PetVaccineRecords` | Deletes a vaccine record. |

### Pet Lost / Found And Notifications

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /v2/pets/pet-lost` | `PetLostandFound` | Lists lost-pet posts. |
| `POST /v2/pets/pet-lost` | `PetLostandFound` | Creates a lost-pet post, including optional pet ownership validation and image upload. |
| `DELETE /v2/pets/pet-lost/{petLostID}` | `PetLostandFound` | Deletes a lost-pet post after ownership/self-access checks. |
| `GET /v2/pets/pet-found` | `PetLostandFound` | Lists found-pet posts. |
| `POST /v2/pets/pet-found` | `PetLostandFound` | Creates a found-pet post, including uploaded image handling. |
| `DELETE /v2/pets/pet-found/{petFoundID}` | `PetLostandFound` | Deletes a found-pet post after ownership/self-access checks. |
| `GET /v2/account/{userId}/notifications` | `PetLostandFound` | Lists notifications for a user. |
| `POST /v2/account/{userId}/notifications` | `PetLostandFound` | Creates a notification for a user. |
| `PUT /v2/account/{userId}/notifications/{notificationId}` | `PetLostandFound` | Archives or marks a notification as handled. |

### Media Upload And AI Analysis

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /util/uploadImage` | `EyeUpload` | Uploads one or more general images to S3 and returns public URLs. |
| `POST /util/uploadPetBreedImage` | `EyeUpload` | Uploads a pet breed image to a validated storage folder and returns its URL. |
| `POST /analysis/eye-upload/{petId}` | `EyeUpload` | Uploads or accepts an eye image URL, calls external eye-analysis and heatmap services, and stores analysis logs. |
| `POST /analysis/breed` | `EyeUpload` | Sends species/image data to the external breed-analysis service and returns the model result. |

### Pet Biometrics

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /petBiometrics/{petId}` | `PetBiometricRoutes` | Returns stored face and nose biometric image URLs for an authorized pet. |
| `POST /petBiometrics/register` | `PetBiometricRoutes` | Creates or updates the stored face/nose biometric reference image sets for a pet and marks it registered. |
| `POST /petBiometrics/verifyPet` | `PetBiometricRoutes` | Verifies a candidate pet image against stored biometric references through the FaceID provider. |

### Purchase, PTag Orders, And Order Verification

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /purchase/confirmation` | `purchaseConfirmation` | Public purchase checkout. Creates an order, generates a unique tag ID, creates an order-verification record, uploads assets, and sends non-fatal email/WhatsApp notifications. |
| `GET /purchase/shop-info` | `purchaseConfirmation` | Public shop metadata lookup with bank details stripped from the response. |
| `GET /purchase/orders` | `purchaseConfirmation` | Admin list of purchase orders with pagination. |
| `GET /purchase/order-verification` | `purchaseConfirmation` | Admin list of order-verification records with pagination. |
| `DELETE /purchase/order-verification/{orderVerificationId}` | `purchaseConfirmation` | Admin soft-cancel of an order-verification record by setting `cancelled=true`. |
| `POST /purchase/send-ptag-detection-email` | `purchaseConfirmation` | Admin-triggered email alert for a PTag detection/location update. |
| `GET /v2/orderVerification/supplier/{orderId}` | `OrderVerification` | Supplier-facing lookup of order-verification details by order ID/contact/tag fallback with authorization checks. |
| `PUT /v2/orderVerification/supplier/{orderId}` | `OrderVerification` | Supplier-facing multipart update of editable verification fields and linked order contact data. |
| `GET /v2/orderVerification/whatsapp-order-link/{_id}` | `OrderVerification` | Returns order-verification details for WhatsApp deep-link flows, with owner/admin access checks. |
| `GET /v2/orderVerification/ordersInfo/{tempId}` | `OrderVerification` | Returns a linked order's pet contact summary for a temporary order ID. |
| `GET /v2/orderVerification/getAllOrders` | `OrderVerification` | Admin/developer list of latest PTag order-verification records. |
| `GET /v2/orderVerification/{tagId}` | `OrderVerification` | Returns tag-bound order-verification details plus linked SF waybill number where available. |
| `PUT /v2/orderVerification/{tagId}` | `OrderVerification` | Updates tag-bound verification fields and attempts WhatsApp tracking notification dispatch. |

### SF Express Logistics

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /sf-express-routes/create-order` | `SFExpressRoutes` | Creates an SF Express shipment/order and returns waybill data. |
| `POST /sf-express-routes/get-pickup-locations` | `SFExpressRoutes` | Fetches SF pickup address options for a selected network code. |
| `POST /sf-express-routes/get-token` | `SFExpressRoutes` | Fetches an SF address API token. |
| `POST /sf-express-routes/get-area` | `SFExpressRoutes` | Fetches SF area metadata. |
| `POST /sf-express-routes/get-netCode` | `SFExpressRoutes` | Fetches SF network code metadata for a type/area selection. |
| `POST /v2/sf-express-routes/print-cloud-waybill` | `SFExpressRoutes` | Requests SF cloud waybill printing/download and emails the generated waybill. |

## Dead Endpoints

### Auth And Account Lifecycle

| Endpoint | Lambda | Status detail |
| --- | --- | --- |
| `POST /account/login` | `UserRoutes` | Frozen password/email login route. Still declared in SAM, but router maps it to `null`, so it returns 405. Use verification-first auth instead. |
| `POST /account/login-2` | `UserRoutes` | Frozen legacy login/check route. Still declared in SAM, but router maps it to `null`, so it returns 405. |
| `POST /account/register-by-email` | `UserRoutes` | Frozen legacy email registration route. Still declared in SAM, but router maps it to `null`, so it returns 405. |
| `POST /account/register-by-phoneNumber` | `UserRoutes` | Frozen legacy phone registration route. Still declared in SAM, but router maps it to `null`, so it returns 405. |
| `POST /account/register-email-2` | `UserRoutes` | Frozen legacy email registration variant. Still declared in SAM, but router maps it to `null`, so it returns 405. |
| `PUT /account/update-password` | `UserRoutes` | Frozen password update route. The active auth flow has no passwords; router maps this route to `null`, so it returns 405. |
| `POST /account/generate-email-code-2` | `EmailVerification` | Frozen email-code variant merged into `POST /account/generate-email-code`; router maps it to `null`, so it returns 405. |

### Pet Profile And Media

| Endpoint | Lambda | Status detail |
| --- | --- | --- |
| `POST /pets/{petID}/basic-info` | `PetBasicInfo` | AWS Console has no POST method for this resource. Active pet basic-info methods are `GET /pets/{petID}/basic-info` and `PUT /pets/{petID}/basic-info`. |
| `GET /pets/gets3Image` | `EyeUpload` | AWS Console points this route to `EyeUpload`, but legacy `EyeUpload` did not handle it; the old implementation lived in legacy `PetLostandFound`. It is intentionally not implemented in the refactored `EyeUpload` router. |
| `POST /pets/upload-array-images` | `EyeUpload` | AWS Console points this route to `EyeUpload`, but legacy `EyeUpload` did not handle it. It is intentionally not implemented in the refactored `EyeUpload` router. |
| `PUT /pets/updatePetImage` | `EyeUpload` | Wrong method. The active image/profile update route is `POST /pets/updatePetImage`. |
| `POST /pets/create-pet-basic-info` | `CreatePetBasicInfo` | AWS Console now points this route to `CreatePetBasicInfo`. It was originally handled in legacy `EyeUpload`, but the refactored active JSON create flow intentionally lives in `CreatePetBasicInfo`. |
| `PUT /pets/updatePetEye` | `GetAllPets` | AWS Console points this route to `GetAllPets`, and legacy `GetAllPets` handled it. The refactored active eye-image append flow remains in `GetAllPets`. |

### Purchase, PTag Orders, And Order Verification

| Endpoint | Lambda | Status detail |
| --- | --- | --- |
| `Unknown Else Probably /ptag?` | `PetLostandFound` | Legacy catch-all ghost entry in router; not a valid HTTP route and not deployed by current SAM template. |
| `PUT /orderVerification/supplier/{proxy+}` | `PetLostandFound` | Dead ghost supplier-order route left from the old monolith. Active supplier order verification now lives under `OrderVerification`. |
| `POST /v2/purchase/confirmation` | `purchaseConfirmation` | Duplicate infrastructure alias for `POST /purchase/confirmation`. The Lambda intentionally does not implement `/v2/purchase/*`; use the canonical non-`/v2` purchase route. |
| `GET /v2/purchase/shop-info` | `purchaseConfirmation` | Duplicate infrastructure alias for `GET /purchase/shop-info`. The Lambda intentionally does not implement `/v2/purchase/*`; use the canonical non-`/v2` purchase route. |
| `GET /v2/purchase/orders` | `purchaseConfirmation` | Duplicate infrastructure alias for `GET /purchase/orders`. The Lambda intentionally does not implement `/v2/purchase/*`; use the canonical non-`/v2` purchase route. |
| `GET /v2/purchase/order-verification` | `purchaseConfirmation` | Duplicate infrastructure alias for `GET /purchase/order-verification`. The Lambda intentionally does not implement `/v2/purchase/*`; use the canonical non-`/v2` purchase route. |
| `DELETE /v2/purchase/order-verification/{orderVerificationId}` | `purchaseConfirmation` | Duplicate infrastructure alias for `DELETE /purchase/order-verification/{orderVerificationId}`. The Lambda intentionally does not implement `/v2/purchase/*`; use the canonical non-`/v2` purchase route. |
| `POST /v2/purchase/send-ptag-detection-email` | `purchaseConfirmation` | Duplicate infrastructure alias for `POST /purchase/send-ptag-detection-email`. The Lambda intentionally does not implement `/v2/purchase/*`; use the canonical non-`/v2` purchase route. |
| `POST /purchase/get-presigned-url` | `purchaseConfirmation` | Exists in AWS Console, but the legacy purchase Lambda did not handle it. It is intentionally not implemented in the refactored router. |
| `POST /v2/purchase/get-presigned-url` | `purchaseConfirmation` | Exists in AWS Console, but the legacy purchase Lambda did not handle it. It is intentionally not implemented in the refactored router. |
| `POST /purchase/whatsapp-SF-message` | `purchaseConfirmation` | Does not exist in AWS Console. Router `null` entry is only a legacy monolith cleanup marker. |
| `POST /v2/purchase/whatsapp-SF-message` | `purchaseConfirmation` | Does not exist in AWS Console. Router `null` entry is only a legacy monolith cleanup marker. |
| `DELETE /v2/orderVerification/{tagId}` | `OrderVerification` | SAM still declares this method, but the router explicitly maps it to `null`, so it returns 405. |
