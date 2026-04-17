# purchaseConfirmation Lambda — API Reference

Base path: `/purchase`

---

## Routes

### POST /purchase/confirmation
**Auth:** None (public)  
**Content-Type:** `multipart/form-data`

Submits a new PTag purchase order. Creates an `Order` and `OrderVerification` document, uploads pet/discount-proof images to S3, sends a confirmation email, and sends a WhatsApp notification.

**Form Fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `lastName` | Yes | Recipient name |
| `email` | Yes | Customer email address |
| `address` | Yes | Delivery address |
| `option` | Yes | Product option (e.g. `PTag`, `PTagAir`, `PTagAir_member`) |
| `tempId` | Yes | Client-generated order reference number |
| `paymentWay` | Yes | Payment method |
| `delivery` | Yes | Delivery method |
| `petName` | Yes | Pet's name |
| `phoneNumber` | Yes | Customer phone number — digits only, 7–15 digits (validated in schema) |
| `type` | No | Order type |
| `shopCode` | Yes | Shop code — used to resolve the server-authoritative price from the `ShopInfo` collection |
| `promotionCode` | No | Promotion/discount code |
| `petContact` | No | Pet contact info |
| `optionImg` | No | Option image URL |
| `optionSize` | No | Product size |
| `optionColor` | No | Product color |
| `lang` | No | `chn` or `eng` (default: `eng`) |
| `pet_img` | No | Pet image file(s) |
| `discount_proof` | No | Discount proof file(s) |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order placed successfully.",
  "purchase_code": "TEMP123",
  "price": 299,
  "_id": "507f1f77bcf86cd799439011"
}
```

**File Upload Constraints:**
- Fields: `pet_img`, `discount_proof`
- Max 1 file per field
- Max 5 MB per file
- Allowed types (magic-byte verified): JPEG, PNG, GIF, WebP

**Error Responses:**
- `400` — Validation failure (invalid email, phone, shopCode, or injected option/tempId)
- `400` — Unsupported file type or file too large
- `400` — `shopCode` not found in database
- `409` — Duplicate `tempId` (order already exists)
- `429` — Rate limit exceeded (10 submissions per IP per hour)

**Rate Limit:** 10 requests per IP per hour.

---

### GET /purchase/shop-info
**Auth:** None (public)

Returns all shop records. Bank credentials (`bankName`, `bankNumber`) are stripped from responses.

**Success Response (200):**
```json
{
  "success": true,
  "shopInfo": [
    {
      "_id": "...",
      "shopCode": "SHOP01",
      "shopName": "Main Shop",
      "shopAddress": "...",
      "shopContact": "...",
      "shopContactPerson": "...",
      "price": 299
    }
  ]
}
```

---

### GET /purchase/orders
**Auth:** Required (JWT Bearer token, admin role)

Returns all purchase orders. Supports optional `?page=` and `?limit=` query params (default: page 1, limit 100, max 500).

**Success Response (200):**
```json
{
  "success": true,
  "orders": [ { ...orderFields } ],
  "pagination": { "page": 1, "limit": 100, "total": 42 }
}
```

---

### GET /purchase/order-verification
**Auth:** Required (JWT Bearer token, admin role)

Returns all order verification records. Supports optional `?page=` and `?limit=` query params (default: page 1, limit 100, max 500).

**Success Response (200):**
```json
{
  "success": true,
  "orderVerification": [ { ...verificationFields } ],
  "pagination": { "page": 1, "limit": 100, "total": 37 }
}
```

---

### DELETE /purchase/order-verification/{orderVerificationId}
**Auth:** Required (JWT Bearer token, admin role)

Soft-cancels a single order verification by MongoDB ObjectId. Sets `cancelled: true` on the document — the record is **not** deleted.

**Path Parameters:**

| Parameter | Description |
|-----------|-------------|
| `orderVerificationId` | MongoDB ObjectId of the verification record |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Cancelled successfully.",
  "orderVerificationId": "507f1f77bcf86cd799439011"
}
```

**Error Responses:**
- `400` — Invalid ObjectId format
- `404` — Order verification not found
- `409` — Order verification already cancelled

---

### POST /purchase/send-ptag-detection-email
**Auth:** Required (JWT Bearer token, admin role)

Sends a PTag detection location alert email (bilingual — Chinese + English) to a pet owner.

**Request Body (JSON):**
```json
{
  "name": "Buddy",
  "tagId": "A2B3C4",
  "dateTime": "2026-04-17 14:30",
  "locationURL": "https://maps.google.com/?q=...",
  "email": "owner@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email sent successfully."
}
```

---

## Dead / Frozen Routes (return 405)

These routes existed in prior infrastructure but are no longer active:

- `POST /purchase/get-presigned-url`
- `POST /v2/purchase/get-presigned-url`
- `POST /purchase/whatsapp-SF-message`
- `POST /v2/purchase/whatsapp-SF-message`

---

## Error Response Shape

All error responses follow this structure:

```json
{
  "success": false,
  "errorKey": "others.internalError",
  "error": "An unexpected error occurred. Please try again later.",
  "requestId": "abc123"
}
```

---

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | JWT signing secret |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |
| `AWS_BUCKET_BASE_URL` | S3 bucket base URL |
| `AWS_BUCKET_NAME` | S3 bucket name |
| `AWS_BUCKET_REGION` | S3 bucket region |
| `AWSACCESSID` | AWS access key ID |
| `AWSSECRETKEY` | AWS secret access key |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP server port (default: 465) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_FROM` | From address for sent emails |
| `WHATSAPP_BEARER_TOKEN` | Meta WhatsApp API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number ID |
| `CUTTLY_API_KEY` | Cutt.ly URL shortener API key (optional) |
