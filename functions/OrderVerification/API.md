# OrderVerification API

## Overview

`OrderVerification` manages PTag verification records, supplier-side order-verification edits, linked order contact summaries, and WhatsApp tracking notification dispatch after tag updates.

All non-`OPTIONS` routes require JWT authentication. The handler lifecycle is:

1. CORS preflight
2. JWT authentication
3. request guard and body parsing
4. MongoDB connection bootstrap
5. exact route dispatch
6. service execution

## Authorization

- Valid Bearer JWT is required for every active route.
- JWT verification is HS256-only.
- `JWT_BYPASS=true` is supported only outside production.
- `admin` and `developer` callers bypass DB-backed order ownership checks.
- `GET /v2/orderVerification/getAllOrders` is restricted to `admin` and `developer`.
- Non-privileged callers on supplier-facing, order-info, and WhatsApp-link routes must match the linked order email from the JWT email claim.
- If a verification record has no linked order, non-privileged WhatsApp-link access falls back to `masterEmail` ownership.

## Routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/v2/orderVerification/supplier/{orderId}` | required | Fetch supplier-side verification by `orderId`, with fallback lookup by `contact` and `tagId`. |
| `PUT` | `/v2/orderVerification/supplier/{orderId}` | required | Update supplier-editable verification fields from multipart form-data. |
| `GET` | `/v2/orderVerification/ordersInfo/{tempId}` | required | Fetch linked order contact summary by temporary order id. |
| `GET` | `/v2/orderVerification/whatsapp-order-link/{_id}` | required | Fetch verification details by document id for WhatsApp deep-link flow. |
| `GET` | `/v2/orderVerification/getAllOrders` | required, admin/developer only | Fetch PTag verification records with a `cancelled` field. |
| `GET` | `/v2/orderVerification/{tagId}` | required | Fetch verification by tag id with linked SF waybill summary. |
| `PUT` | `/v2/orderVerification/{tagId}` | required | Update tag verification fields and attempt WhatsApp tracking notification dispatch. |
| `DELETE` | `/v2/orderVerification/{tagId}` | required | Frozen route. Always returns `405 others.methodNotAllowed`. |

Unsupported methods and unknown exact route keys return `405 others.methodNotAllowed`.

## Request Bodies

### PUT /v2/orderVerification/supplier/{orderId}

Content type: `multipart/form-data`.

Accepted fields:

- `contact`
- `petName`
- `shortUrl`
- `masterEmail`
- `location`
- `petHuman`
- `pendingStatus` boolean
- `qrUrl`
- `petUrl`
- `petContact`

Behavior:

- `contact` and `petContact` are normalized as phone strings.
- `masterEmail` is normalized to lowercase.
- `petContact` updates the linked `Order` document using the resolved verification record's `orderId`.
- Empty multipart bodies return `400 others.missingParams`.
- If the multipart payload has no updatable verification fields and no `petContact`, the route returns `400 others.missingParams`.

Success:

```json
{
  "success": true,
  "message": "Tag info updated successfully",
  "updateResult": {
    "acknowledged": true,
    "matchedCount": 1,
    "modifiedCount": 1
  }
}
```

### PUT /v2/orderVerification/{tagId}

Content type: `application/json`.

Accepted fields:

- `contact`
- `verifyDate`
- `petName`
- `shortUrl`
- `masterEmail`
- `orderId`
- `location`
- `petHuman`

Behavior:

- `verifyDate` accepts `DD/MM/YYYY`, ISO-like date strings, or Date-compatible values.
- Duplicate `orderId` reassignment is rejected with `409 orderVerification.errors.duplicateOrderId`.
- `staffVerification` is not client-submittable.
- WhatsApp notification dispatch is attempted after a successful update.
- Missing `WHATSAPP_BEARER_TOKEN`, missing order phone/waybill, or provider failure does not roll back a successful DB update. The response indicates dispatch outcome.

Example:

```json
{
  "verifyDate": "21/04/2026",
  "petName": "Mochi",
  "location": "Hong Kong",
  "orderId": "TEMP_123"
}
```

Success:

```json
{
  "success": true,
  "message": "Tag info updated successfully",
  "id": "66263b7c9f1d2b0012345678",
  "notificationDispatched": false
}
```

## Read Response Examples

### GET /v2/orderVerification/{tagId}

```json
{
  "success": true,
  "message": "Order Verification info retrieved successfully",
  "form": {
    "tagId": "PTAG123",
    "staffVerification": false,
    "contact": "91234567",
    "verifyDate": "2026-04-21T00:00:00.000Z",
    "petName": "Mochi",
    "shortUrl": "https://example.com/tag",
    "masterEmail": "owner@example.com",
    "orderId": "TEMP_123",
    "location": "Hong Kong",
    "petHuman": "Chan",
    "pendingStatus": false,
    "option": "PTag"
  },
  "id": "66263b7c9f1d2b0012345678",
  "sf": "SF1234567890"
}
```

### GET /v2/orderVerification/ordersInfo/{tempId}

```json
{
  "success": true,
  "message": "Order Verification info retrieved successfully",
  "form": {
    "petContact": "91234567"
  },
  "id": "66263b7c9f1d2b0012345678"
}
```

## Sanitized Output

Entity responses use allowlisted projections and sanitizers. Sensitive or non-contract fields such as `discountProof` are not returned by the verified read paths.

## Error Response Shape

```json
{
  "success": false,
  "errorKey": "orderVerification.errors.notFound",
  "error": "Order verification not found",
  "requestId": "aws-request-id"
}
```

`error` is translated from locale bundles. `OrderVerification` defaults to English unless `queryStringParameters.lang`, `x-language`, or `X-Language` is supplied.

## Common Error Keys

| errorKey | Meaning |
| --- | --- |
| `others.internalError` | Internal server error. |
| `others.methodNotAllowed` | Unsupported method or frozen route. |
| `others.invalidJSON` | Malformed JSON request body. |
| `others.missingParams` | Required body or update payload is missing. |
| `others.unauthorized` | Missing/invalid JWT, insufficient role, or ownership failure. |
| `others.originNotAllowed` | CORS preflight origin is not allowed. |
| `others.invalidInput` | Generic invalid input. |
| `orderVerification.errors.missingOrderId` | Supplier `orderId` path parameter is missing. |
| `orderVerification.errors.missingTagId` | `tagId` path parameter is missing. |
| `orderVerification.errors.missingTempId` | `tempId` path parameter is missing. |
| `orderVerification.errors.missingVerificationId` | `_id` path parameter is missing. |
| `orderVerification.errors.invalidVerificationId` | `_id` is not a valid ObjectId. |
| `orderVerification.errors.notFound` | Verification record was not found. |
| `orderVerification.errors.orderNotFound` | Linked order was not found. |
| `orderVerification.errors.noOrders` | Admin list found no latest PTag orders. |
| `orderVerification.errors.duplicateOrderId` | Another verification already uses the requested `orderId`. |
| `orderVerification.errors.invalidDate` | `verifyDate` is invalid. |
| `orderVerification.errors.invalidField` | Field value does not match the schema. |
| `orderVerification.errors.invalidPendingStatus` | `pendingStatus` is not boolean. |

## Environment

Required:

- `MONGODB_URI`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`

Optional:

- `JWT_BYPASS`
- `WHATSAPP_BEARER_TOKEN`

`WHATSAPP_BEARER_TOKEN` is optional so read/update testing environments can start without outbound WhatsApp credentials. Missing token skips notification dispatch instead of blocking startup.
