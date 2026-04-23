# Purchase & Order Verification API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

PTag purchase checkout, shop metadata, admin order list, and supplier / owner order-verification flows.

> Conventions: [README.md](./README.md).

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/purchase/confirmation` | Public | Guest checkout → create order |
| GET | `/purchase/shop-info` | Public | Shop info (bank details stripped) |
| GET | `/purchase/orders` | Admin | Paginated order list |
| GET | `/purchase/order-verification` | Admin | Paginated verification list |
| DELETE | `/purchase/order-verification/{orderVerificationId}` | Admin | Soft-cancel a verification |
| POST | `/purchase/send-ptag-detection-email` | Admin | Send detection email alert |
| GET | `/v2/orderVerification/supplier/{orderId}` | Supplier / Owner | Supplier order lookup |
| PUT | `/v2/orderVerification/supplier/{orderId}` | Supplier / Owner | Supplier order update (multipart) |
| GET | `/v2/orderVerification/whatsapp-order-link/{_id}` | Admin / Owner | WhatsApp deep-link details |
| GET | `/v2/orderVerification/ordersInfo/{tempId}` | Owner | Linked-order contact info |
| GET | `/v2/orderVerification/getAllOrders` | Admin | Full verification dump (no pagination) |
| GET | `/v2/orderVerification/{tagId}` | Bearer JWT | Tag-bound verification details |
| PUT | `/v2/orderVerification/{tagId}` | Bearer JWT | Tag-bound verification update |

**Roles:**

- **Admin** = `userRole` is `admin` or `developer`
- **Supplier / Owner** = non-privileged caller whose email matches `orderVerification.masterEmail` **or** the linked `Order.email`

---

## Lambda: purchaseConfirmation

### POST /purchase/confirmation

Public checkout. `multipart/form-data`. Creates an `Order`, generates a unique `tagId`, creates an `OrderVerification`, uploads images, and attempts email + WhatsApp notifications (non-fatal).

**Rate limit:** 10 / 3600 s per IP / identifier.

**Form fields:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `lastName` | string | Yes | |
| `email` | string | Yes | Valid email |
| `address` | string | Yes | |
| `option` | string | Yes | 1–64 chars, `^[a-zA-Z0-9_-]+$` |
| `tempId` | string | Yes | 1–64 chars, `^[a-zA-Z0-9_-]+$` |
| `paymentWay` | string | Yes | Max 128 |
| `delivery` | string | Yes | Max 128 |
| `petName` | string | Yes | |
| `phoneNumber` | string | Yes | `^\d{7,15}$` |
| `shopCode` | string | Yes | Max 64, must exist in shop catalog |
| `type` | string | No | Default `""`, max 64 |
| `promotionCode` | string | No | Default `""`, max 64 |
| `petContact` | string | No | Default `""` |
| `optionImg` | string | No | Default `""` |
| `optionSize` | string | No | Default `""`, max 32 |
| `optionColor` | string | No | Default `""`, max 64 |
| `lang` | enum | No | `"chn"` or `"eng"`; default `"eng"` |
| `pet_img` | file[] | No | Product / pet photos |
| `discount_proof` | file[] | No | |

**Success (200):**

```json
{
  "success": true,
  "message": "Order placed successfully.",
  "purchase_code": "<tempId>",
  "price": 399,
  "_id": "<orderVerificationId>"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` | |
| 400 | `purchaseConfirmation.errors.purchase.missingRequiredFields` | Required field missing |
| 400 | `purchaseConfirmation.errors.purchase.invalidEmail` | |
| 400 | `purchaseConfirmation.errors.purchase.invalidPhone` | |
| 400 | `purchaseConfirmation.errors.purchase.invalidOption` / `purchaseConfirmation.errors.purchase.invalidTempId` | Regex failed |
| 400 | `purchaseConfirmation.errors.purchase.invalidShopCode` | shopCode not found |
| 400 | `purchaseConfirmation.errors.purchase.invalidFileType` / `purchaseConfirmation.errors.purchase.fileTooLarge` | File rejection |
| 409 | `purchaseConfirmation.errors.purchase.duplicateOrder` | tempId already used |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | |

---

### GET /purchase/shop-info

**Auth:** Public

Bank details are stripped (sanitized) before returning.

**Success (200):**

```json
{
  "success": true,
  "shopInfo": [
    {
      "shopCode": "SHOP001",
      "shopName": "Pet Pet Club",
      "shopAddress": "...",
      "shopContact": "...",
      "shopContactPerson": "...",
      "price": 399
    }
  ]
}
```

**Errors:** `500 common.internalError`.

---

### GET /purchase/orders

**Auth:** Bearer JWT, role `admin` or `developer`.

**Query params:**

| Param | Type | Default | Limits |
| --- | --- | --- | --- |
| `page` | number | `1` | ≥ 1 |
| `limit` | number | `100` | 1–500 |

**Success (200):**

```json
{
  "success": true,
  "orders": [
    {
      "_id": "...",
      "isPTagAir": false,
      "lastName": "Chan",
      "email": "...",
      "phoneNumber": "...",
      "address": "...",
      "paymentWay": "...",
      "delivery": "...",
      "tempId": "...",
      "option": "...",
      "type": "...",
      "price": 399,
      "petImg": "https://...",
      "promotionCode": "",
      "shopCode": "SHOP001",
      "buyDate": "2025-04-01T00:00:00.000Z",
      "petName": "...",
      "petContact": "",
      "sfWayBillNumber": null,
      "language": "eng",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 532 }
}
```

**Errors:** `401`/`403 common.unauthorized`, `500 common.internalError`.

---

### GET /purchase/order-verification

**Auth:** Admin. Same pagination as `/purchase/orders`.

**Success (200):**

```json
{
  "success": true,
  "orderVerification": [
    {
      "_id": "...",
      "tagId": "...",
      "staffVerification": false,
      "cancelled": false,
      "verifyDate": null,
      "petName": "...",
      "shortUrl": "...",
      "masterEmail": "...",
      "qrUrl": "https://...",
      "petUrl": null,
      "orderId": "...",
      "pendingStatus": true,
      "option": "...",
      "type": "...",
      "optionSize": "",
      "optionColor": "",
      "price": 399,
      "discountProof": null,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 210 }
}
```

**Errors:** `401`/`403 common.unauthorized`, `500 common.internalError`.

---

### DELETE /purchase/order-verification/{orderVerificationId}

Soft-cancel (`cancelled: true`). Idempotency check returns 409 if already cancelled.

**Auth:** Admin.

**Path params:** `orderVerificationId` (ObjectId)

**Success (200):**

```json
{ "success": true, "message": "Cancelled successfully.", "orderVerificationId": "..." }
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidObjectId` | |
| 401 / 403 | `common.unauthorized` | |
| 404 | `purchaseConfirmation.errors.purchase.orderVerificationNotFound` | |
| 409 | `purchaseConfirmation.errors.purchase.alreadyCancelled` | |
| 500 | `common.internalError` | |

---

### POST /purchase/send-ptag-detection-email

Admin-triggered email alert. `application/json`.

**Auth:** Admin.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | Yes | Pet name |
| `tagId` | string | Yes | |
| `dateTime` | string | Yes | Detection timestamp |
| `locationURL` | string | Yes | Must be valid URL starting with `https://` |
| `email` | string | Yes | Recipient |

**Success (200):** `{ success: true, message: "Email sent successfully." }`

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` | |
| 400 | `purchaseConfirmation.errors.email.missingFields` | |
| 400 | `purchaseConfirmation.errors.email.invalidEmail` | |
| 400 | `purchaseConfirmation.errors.email.invalidLocationURL` | Not HTTPS or invalid URL |
| 401 / 403 | `common.unauthorized` | |
| 500 | `common.internalError` | SMTP failure |

---

## Lambda: OrderVerification

### GET /v2/orderVerification/supplier/{orderId}

Supplier lookup. Looks up `OrderVerification` by `orderId` → `contact` → `tagId` (cascading). Ownership: caller email must match `masterEmail` or linked `Order.email`; privileged roles bypass.

**Path params:** `orderId` (string, not necessarily ObjectId)

**Success (200):**

```json
{
  "success": true,
  "message": "Order Verification info retrieved successfully",
  "form": {
    "tagId": "...",
    "staffVerification": false,
    "contact": "...",
    "verifyDate": null,
    "tagCreationDate": "...",
    "petName": "...",
    "shortUrl": "...",
    "masterEmail": "...",
    "qrUrl": "https://...",
    "petUrl": null,
    "orderId": "...",
    "location": null,
    "petHuman": null,
    "createdAt": "...",
    "updatedAt": "...",
    "pendingStatus": true,
    "option": "...",
    "optionSize": "",
    "optionColor": ""
  },
  "id": "<OrderVerification._id>"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `orderVerification.errors.missingOrderId` | |
| 401 | `common.unauthorized` | |
| 403 | `common.unauthorized` | Email mismatch |
| 404 | `orderVerification.errors.notFound` | |
| 500 | `common.internalError` | |

---

### PUT /v2/orderVerification/supplier/{orderId}

Supplier update. Accepts `multipart/form-data` or `application/json`. Schema `.strict()` — no extra fields.

**Body** (all optional; at least one required):

| Field | Type | Notes |
| --- | --- | --- |
| `contact` | string | Normalized to phone |
| `petName` | string | |
| `shortUrl` | string | |
| `masterEmail` | string | Normalized email |
| `location` | string | |
| `petHuman` | string | |
| `pendingStatus` | boolean | |
| `qrUrl` | string | |
| `petUrl` | string | |
| `petContact` | string | Also written to linked `Order.petContact` |

**Success (200):**

```json
{
  "success": true,
  "message": "Tag info updated successfully",
  "updateResult": {
    "acknowledged": true,
    "modifiedCount": 1,
    "upsertedCount": 0,
    "matchedCount": 1
  }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 400 | `orderVerification.errors.missingOrderId` | |
| 400 | `orderVerification.errors.invalidField` | |
| 401 / 403 | `common.unauthorized` | |
| 404 | `orderVerification.errors.notFound` | |
| 500 | `common.internalError` | |

---

### GET /v2/orderVerification/whatsapp-order-link/{_id}

For WhatsApp deep-link UX. Admin OR owner (email match to linked `Order` or `masterEmail`).

**Path params:** `_id` (ObjectId)

**Success (200):**

```json
{
  "success": true,
  "message": "Order Verification info retrieved successfully",
  "form": { "...": "verification doc (see /supplier response)", "price": 399, "type": "..." },
  "id": "<OrderVerification._id>"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `orderVerification.errors.missingVerificationId` / `orderVerification.errors.invalidVerificationId` | |
| 401 / 403 | `common.unauthorized` | |
| 404 | `orderVerification.errors.notFound` | |
| 500 | `common.internalError` | |

---

### GET /v2/orderVerification/ordersInfo/{tempId}

Minimal linked-order contact info. Owner-only (email match on linked `Order`).

**Path params:** `tempId` (string — matches `Order.tempId`)

**Success (200):**

```json
{
  "success": true,
  "message": "Order Verification info retrieved successfully",
  "form": { "petContact": "..." },
  "id": "<Order._id>"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `orderVerification.errors.missingTempId` | |
| 401 / 403 | `common.unauthorized` | |
| 404 | `orderVerification.errors.orderNotFound` | |
| 500 | `common.internalError` | |

---

### GET /v2/orderVerification/getAllOrders

Admin-only full dump (no pagination). Filters to docs where `cancelled` field exists.

**Success (200):**

```json
{
  "success": true,
  "message": "Latest PTag orders retrieved successfully",
  "allOrders": [ { "...": "verification doc" } ]
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 401 / 403 | `common.unauthorized` | |
| 404 | `orderVerification.errors.noOrders` | |
| 500 | `common.internalError` | |

---

### GET /v2/orderVerification/{tagId}

Tag-bound verification details + linked `Order.sfWayBillNumber`.

**Auth:** Bearer JWT (any role).

**Path params:** `tagId` (string)

**Success (200):**

```json
{
  "success": true,
  "message": "Order Verification info retrieved successfully",
  "form": { "...": "verification doc" },
  "id": "<OrderVerification._id>",
  "sf": "SF1234567890"
}
```

`sf` is the linked order's SF waybill number; `null` or `undefined` when no waybill exists.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `orderVerification.errors.missingTagId` | |
| 401 | `common.unauthorized` | |
| 404 | `orderVerification.errors.notFound` | |
| 500 | `common.internalError` | |

---

### PUT /v2/orderVerification/{tagId}

Update verification fields and optionally fire a WhatsApp tracking notification (non-fatal).

**Auth:** Bearer JWT.

**Content-Type:** `multipart/form-data` or `application/json`.

**Body** (all optional, strict schema, at least one required):

| Field | Type | Notes |
| --- | --- | --- |
| `contact` | string | Normalized phone |
| `verifyDate` | string \| Date | `DD/MM/YYYY` when string |
| `petName` | string | |
| `shortUrl` | string | |
| `masterEmail` | string | Normalized email |
| `orderId` | string | Must be unique across OrderVerification records |
| `location` | string | |
| `petHuman` | string | |

**Success (200):**

```json
{
  "success": true,
  "message": "Tag info updated successfully",
  "id": "<OrderVerification._id>",
  "notificationDispatched": true
}
```

`notificationDispatched` is `false` when WhatsApp prerequisites are missing (no bearer token, no SF waybill, no contact) or the provider errored — the update itself still succeeds.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 400 | `orderVerification.errors.missingTagId` | |
| 400 | `orderVerification.errors.invalidField` | |
| 400 | `orderVerification.errors.invalidDate` | `verifyDate` not `DD/MM/YYYY` |
| 400 | `orderVerification.errors.invalidPendingStatus` | |
| 401 | `common.unauthorized` | |
| 404 | `orderVerification.errors.notFound` | |
| 409 | `orderVerification.errors.duplicateOrderId` | New `orderId` collides |
| 500 | `common.internalError` | |
