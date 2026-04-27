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

## Active Endpoints

### Auth And Account Lifecycle

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /account/generate-email-code` | `EmailVerification` | Starts an email-based verification challenge by issuing a short-lived 6-digit code for registration, login, or account-linking flows. |
| `POST /account/verify-email-code` | `EmailVerification` | Consumes an email verification code and either returns proof for a new account flow, logs in an existing account, or links the email to the authenticated user. |
| `POST /account/generate-sms-code` | `UserRoutes` | Starts an SMS-based verification challenge through Twilio Verify for registration, login, or phone-linking flows. |
| `POST /account/verify-sms-code` | `UserRoutes` | Consumes an SMS verification code and either returns proof for a new account flow, logs in an existing account, or links the phone number to the authenticated user. |
| `POST /account/register` | `UserRoutes` | Creates a normal user account only after recent email and/or phone verification proof exists, then issues access and refresh tokens. |
| `POST /auth/refresh` | `AuthRoute` | Exchanges a valid refresh-token cookie for a new access token and rotated refresh cookie. |
| `PUT /account` | `UserRoutes` | Updates self-service account profile fields after validation and duplicate checks for email and phone conflicts. |
| `GET /account/{userId}` | `UserRoutes` | Returns a sanitized active user profile for an existing, non-deleted account. |
| `DELETE /account/{userId}` | `UserRoutes` | Soft-deletes a user account by ID and revokes all stored refresh tokens for that account. |
| `POST /account/delete-user-with-email` | `UserRoutes` | Soft-deletes a user account found by email address and revokes all stored refresh tokens for that account. |
| `POST /account/update-image` | `UserRoutes` | Updates only the authenticated user's profile image field without running the broader account update flow. |

### NGO Administration

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /v2/account/register-ngo` | `UserRoutes` | Onboards a new NGO by creating the NGO admin account, NGO profile, NGO access mapping, and NGO pet counter in one transaction, then signs in the new admin. |
| `GET /v2/account/user-list` | `UserRoutes` | Returns a paginated NGO staff/admin list with joined user, NGO, and counter data for admin management screens. |
| `GET /v2/account/edit-ngo/{ngoId}` | `UserRoutes` | Returns the full NGO edit payload, including NGO profile, linked admin user profile, NGO access settings, and NGO counter values. |
| `PUT /v2/account/edit-ngo/{ngoId}` | `UserRoutes` | Applies an NGO admin edit transaction that can update NGO profile fields, admin user fields, NGO counter settings, and NGO access permissions together. |
| `GET /v2/account/edit-ngo/{ngoId}/pet-placement-options` | `UserRoutes` | Returns the NGO's configured pet placement option set used by downstream pet/adoption workflows. |

### Pet Profile And Ownership

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /animal/animalList/{lang}` | `GetBreed` | Returns localized species/animal option data used by legacy pet creation and edit forms. |
| `POST /pets/create-pet-basic-info` | `CreatePetBasicInfo` | Creates a pet record from JSON input under the authenticated owner's identity and blocks duplicate tag assignment. |
| `POST /pets/create-pet-basic-info-with-image` | `EyeUpload` | Creates a pet from multipart form data, uploads initial pet images, and for NGO callers may generate an NGO-specific pet sequence ID. |
| *?* `GET /pets/getPetInfobyTagId/{tagId}` | `PetInfoByPetNumber` | Performs a public-safe lookup of a pet by tag ID and returns only a limited profile projection. |
| `GET /pets/pet-list/{userId}` | `GetAllPets` | Returns the pet list owned by a specific user for account-side pet management screens. |
| `GET /pets/pet-list-ngo/{ngoId}` | `GetAllPets` | Returns the pet list associated with a specific NGO for NGO pet management screens. |
| `GET /pets/{petID}/basic-info` | `PetBasicInfo` | Returns the core editable pet profile fields for an authorized pet record. |
| `PUT /pets/{petID}/basic-info` | `PetBasicInfo` | Updates the core editable pet profile fields for an authorized pet record. |
| `DELETE /pets/{petID}` | `PetBasicInfo` | Soft-deletes an authorized pet record and clears its tag assignment so the tag can no longer resolve to that pet. |
| `POST /pets/deletePet` | `GetAllPets` | Legacy body-based soft-delete flow for a pet, retained for compatibility with older callers. |
| `POST /pets/updatePetImage` | `EyeUpload` | Updates a pet through multipart input by adding/removing images and changing selected profile fields in the same request after ownership checks. |
| `GET /pets/{petID}/detail-info` | `PetDetailInfo` | Returns extended pet detail fields such as chip, birthplace, parent lineage, and transfer-related detail data. |
| `POST /pets/{petID}/detail-info` | `PetDetailInfo` | Updates extended pet detail fields such as chip, birthplace, parent lineage, and related structured detail data. |
| `POST /pets/{petID}/detail-info/transfer` | `PetDetailInfo` | Appends a new owner-transfer history record to the pet. |
| `PUT /pets/{petID}/detail-info/transfer/{transferId}` | `PetDetailInfo` | Updates one existing owner-transfer history record on the pet. |
| `DELETE /pets/{petID}/detail-info/transfer/{transferId}` | `PetDetailInfo` | Removes one existing owner-transfer history record from the pet. |
| `PUT /pets/{petID}/detail-info/NGOtransfer` | `PetDetailInfo` | Reassigns an NGO-managed pet to a validated target user and rewrites the transfer-related ownership/contact fields. |
| `GET /v2/pets/{petID}/detail-info/source` | `PetDetailInfo` | Returns the pet's source/origin record, such as origin channel, rescue category, and injury cause. |
| `POST /v2/pets/{petID}/detail-info/source` | `PetDetailInfo` | Creates the pet's source/origin record when one does not already exist. |
| `PUT /v2/pets/{petID}/detail-info/source/{sourceId}` | `PetDetailInfo` | Updates the existing source/origin record linked to the pet. |

### Pet Adoption

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /v2/pets/{petID}/pet-adoption` | `PetDetailInfo` | Returns the managed adoption/placement record linked to a pet, including follow-up and medical-adoption fields. |
| `POST /v2/pets/{petID}/pet-adoption` | `PetDetailInfo` | Creates the managed adoption/placement record for a pet when one does not already exist. |
| `PUT /v2/pets/{petID}/pet-adoption/{adoptionId}` | `PetDetailInfo` | Updates the managed adoption/placement record for a pet, including follow-up schedule flags. |
| `DELETE /v2/pets/{petID}/pet-adoption/{adoptionId}` | `PetDetailInfo` | Deletes the managed adoption/placement record linked to a pet. |
| `GET /adoption` | `GetAdoption` | Returns the public adoption browse feed with filters, keyword search, pagination, and exclusion of blocked source sites. |
| `GET /adoption/{id}` | `GetAdoption` | Returns the public detail page data for one adoption-listing pet. |

### Pet Health And Clinical Records

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /deworm` | `GetBreed` | Returns deworming reference content used by legacy health guidance and product suggestion flows. |
| `GET /pets/{petID}/eyeLog` | `PetBasicInfo` | Returns stored eye-analysis history entries for a pet. |
| `PUT /pets/updatePetEye` | `GetAllPets` | Appends new eye image URLs and the related capture date to a pet's eye-analysis history fields. |
| `GET /pets/{petID}/medical-record` | `PetMedicalRecord` | Returns the pet's general medical record entries. |
| `POST /pets/{petID}/medical-record` | `PetMedicalRecord` | Creates a new general medical record entry for the pet. |
| `PUT /pets/{petID}/medical-record/{medicalID}` | `PetMedicalRecord` | Updates one general medical record entry for the pet. |
| `DELETE /pets/{petID}/medical-record/{medicalID}` | `PetMedicalRecord` | Deletes one general medical record entry for the pet. |
| `GET /pets/{petID}/medication-record` | `PetMedicalRecord` | Returns the pet's medication administration or prescription records. |
| `POST /pets/{petID}/medication-record` | `PetMedicalRecord` | Creates a medication administration or prescription record for the pet. |
| `PUT /pets/{petID}/medication-record/{medicationID}` | `PetMedicalRecord` | Updates one medication administration or prescription record for the pet. |
| `DELETE /pets/{petID}/medication-record/{medicationID}` | `PetMedicalRecord` | Deletes one medication administration or prescription record for the pet. |
| `GET /pets/{petID}/deworm-record` | `PetMedicalRecord` | Returns the pet's deworming treatment records. |
| `POST /pets/{petID}/deworm-record` | `PetMedicalRecord` | Creates a deworming treatment record for the pet. |
| `PUT /pets/{petID}/deworm-record/{dewormID}` | `PetMedicalRecord` | Updates one deworming treatment record for the pet. |
| `DELETE /pets/{petID}/deworm-record/{dewormID}` | `PetMedicalRecord` | Deletes one deworming treatment record for the pet. |
| `GET /v2/pets/{petID}/blood-test-record` | `PetMedicalRecord` | Returns the pet's blood-test records. |
| `POST /v2/pets/{petID}/blood-test-record` | `PetMedicalRecord` | Creates a blood-test record and also updates related pet summary fields when the record carries summary data. |
| `PUT /v2/pets/{petID}/blood-test-record/{bloodTestID}` | `PetMedicalRecord` | Updates a blood-test record and also updates related pet summary fields when needed. |
| `DELETE /v2/pets/{petID}/blood-test-record/{bloodTestID}` | `PetMedicalRecord` | Deletes one blood-test record for the pet. |
| `GET /pets/{petID}/vaccine-record` | `PetVaccineRecords` | Returns the pet's vaccination records. |
| `POST /pets/{petID}/vaccine-record` | `PetVaccineRecords` | Creates a vaccination record for the pet. |
| `PUT /pets/{petID}/vaccine-record/{vaccineID}` | `PetVaccineRecords` | Updates one vaccination record for the pet. |
| `DELETE /pets/{petID}/vaccine-record/{vaccineID}` | `PetVaccineRecords` | Deletes one vaccination record for the pet. |

### Pet Lost / Found And Notifications

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /v2/pets/pet-lost` | `PetLostandFound` | Returns the public/legacy lost-pet post feed. |
| `POST /v2/pets/pet-lost` | `PetLostandFound` | Creates a lost-pet report, optionally links it to an owned pet, updates that pet's status, uploads images, and assigns a serial number. |
| `DELETE /v2/pets/pet-lost/{petLostID}` | `PetLostandFound` | Deletes one lost-pet report after confirming the caller owns the report. |
| `GET /v2/pets/pet-found` | `PetLostandFound` | Returns the public/legacy found-pet post feed. |
| `POST /v2/pets/pet-found` | `PetLostandFound` | Creates a found-pet report with uploaded images and structured found-location details. |
| `DELETE /v2/pets/pet-found/{petFoundID}` | `PetLostandFound` | Deletes one found-pet report after confirming the caller owns the report. |
| `GET /v2/account/{userId}/notifications` | `PetLostandFound` | Returns the notification inbox for a user, newest first. |
| `POST /v2/account/{userId}/notifications` | `PetLostandFound` | Creates a notification entry for a user, optionally linked to a pet or nearby lost-pet event. |
| `PUT /v2/account/{userId}/notifications/{notificationId}` | `PetLostandFound` | Archives a notification entry for a user. |

### Media Upload And AI Analysis

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /util/uploadImage` | `EyeUpload` | Uploads a generic image file to S3 and returns the stored public URL for later use by the client. |
| `POST /util/uploadPetBreedImage` | `EyeUpload` | Uploads one image file to an allowlisted S3 folder chosen by the caller and returns the stored public URL. |
| `GET /analysis/{eyeDiseaseName}` | `GetBreed` | Returns static eye-disease explanatory/reference content used to interpret eye-analysis results. |
| `POST /analysis/eye-upload/{petId}` | `EyeUpload` | Accepts an uploaded eye image or image URL, calls the external eye-analysis and heatmap services, stores the audit/result logs, and returns the model output. |
| `POST /analysis/breed` | `EyeUpload` | Sends species plus image URL to the external breed-analysis service and returns the classification result. |

### Pet Biometrics

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /petBiometrics/{petId}` | `PetBiometricRoutes` | Returns the stored biometric reference assets for a pet, such as face and nose images. |
| `POST /petBiometrics/register` | `PetBiometricRoutes` | Creates or refreshes the pet's biometric reference set and marks the pet as biometric-registered. |
| `POST /petBiometrics/verifyPet` | `PetBiometricRoutes` | Verifies a candidate pet image against the registered biometric reference set through the FaceID provider. |

### Purchase, PTag Orders, And Order Verification

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `GET /product/productList` | `GetBreed` | Returns the legacy product catalog/reference list used by recommendation or purchase-adjacent screens. |
| `POST /product/productLog` | `GetBreed` | Records a user's product-view/access event for legacy analytics or recommendation tracking. |
| `POST /purchase/confirmation` | `purchaseConfirmation` | Runs the public checkout flow: validates multipart input, stores uploaded assets, creates the order, generates a tag ID, creates the linked order-verification record, and triggers non-fatal email/WhatsApp notifications. |
| `GET /purchase/shop-info` | `purchaseConfirmation` | Returns public shop metadata needed by the checkout flow, with sensitive bank details removed from the payload. |
| `GET /purchase/orders` | `purchaseConfirmation` | Returns the admin order-management list of purchase orders. |
| `GET /purchase/order-verification` | `purchaseConfirmation` | Returns the admin order-verification management list. |
| `DELETE /purchase/order-verification/{orderVerificationId}` | `purchaseConfirmation` | Soft-cancels an order-verification record by marking it cancelled rather than hard-deleting it. |
| `POST /purchase/send-ptag-detection-email` | `purchaseConfirmation` | Sends an admin-triggered alert email related to a PTag detection or location event. |
| `GET /v2/orderVerification/supplier/{orderId}` | `OrderVerification` | Returns the supplier-facing verification/edit view for one order, resolving by order ID with controlled fallback matching and authorization. |
| `PUT /v2/orderVerification/supplier/{orderId}` | `OrderVerification` | Lets a supplier update the allowed verification fields for one order and, when provided, sync the linked order contact field. |
| `GET /v2/orderVerification/whatsapp-order-link/{_id}` | `OrderVerification` | Returns the verification/order payload used by the WhatsApp deep-link flow after owner or admin authorization checks. |
| `GET /v2/orderVerification/ordersInfo/{tempId}` | `OrderVerification` | Returns the pet contact summary for one linked order identified by temporary order ID. |
| `GET /v2/orderVerification/getAllOrders` | `OrderVerification` | Returns the admin/developer operations list of order-verification records. |
| `GET /v2/orderVerification/{tagId}` | `OrderVerification` | Returns the tag-bound verification record plus the linked SF waybill number when one exists. |
| `PUT /v2/orderVerification/{tagId}` | `OrderVerification` | Updates allowed fields on the tag-bound verification record and may trigger downstream WhatsApp tracking notification logic. |

### SF Express Logistics

| Endpoint | Lambda | Purpose / actual behavior |
| --- | --- | --- |
| `POST /sf-express-routes/create-order` | `SFExpressRoutes` | Creates an SF Express shipment for authorized orders and writes the returned waybill number back onto the linked order records. |
| `POST /sf-express-routes/get-pickup-locations` | `SFExpressRoutes` | Returns SF pickup-location options for a validated network-code/location search. |
| `POST /sf-express-routes/get-token` | `SFExpressRoutes` | Returns the SF address-service bearer token used by the client's legacy address lookup flow. |
| `POST /sf-express-routes/get-area` | `SFExpressRoutes` | Returns SF area metadata for the legacy address lookup flow. |
| `POST /sf-express-routes/get-netCode` | `SFExpressRoutes` | Returns SF network-code metadata for the legacy address lookup flow. |
| `POST /v2/sf-express-routes/print-cloud-waybill` | `SFExpressRoutes` | Requests SF cloud-waybill PDF generation/download and emails the generated waybill document. |

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
