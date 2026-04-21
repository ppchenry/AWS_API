# OrderVerification API

## Routes

- `GET /v2/orderVerification/supplier/{orderId}` (auth required): Fetch order verification by `orderId`, or fallback by contact/tag id.
- `PUT /v2/orderVerification/supplier/{orderId}` (auth required): Update supplier-side order verification fields from multipart payload.
- `GET /v2/orderVerification/ordersInfo/{tempId}` (auth required): Get order contact summary by temporary order id.
- `GET /v2/orderVerification/whatsapp-order-link/{_id}` (auth required): Get order verification details by document id.
- `GET /v2/orderVerification/getAllOrders` (auth required): Fetch all PTag orders with `cancelled` field.
- `GET /v2/orderVerification/{tagId}` (auth required): Get order verification by tag id, with SF waybill summary.
- `PUT /v2/orderVerification/{tagId}` (auth required): Update tag verification fields and dispatch WhatsApp tracking template.
- `DELETE /v2/orderVerification/{tagId}` (auth required): frozen route, returns 405.

Ownership behavior:

- `admin` and `developer` callers bypass order ownership checks.
- Non-privileged callers on supplier-facing routes must match the linked order email from the JWT email claim.
- `WHATSAPP_BEARER_TOKEN` is optional for read/update testing environments; missing token skips notification dispatch instead of blocking startup.

## Request Body

### PUT /v2/orderVerification/supplier/{orderId}

Accepted multipart fields:

- `contact`
- `petName`
- `shortUrl`
- `masterEmail`
- `location`
- `petHuman`
- `pendingStatus` (boolean)
- `qrUrl`
- `petUrl`
- `petContact`

### PUT /v2/orderVerification/{tagId}

Accepted JSON fields:

- `contact`
- `verifyDate` (date string)
- `petName`
- `shortUrl`
- `masterEmail`
- `orderId`
- `location`
- `petHuman`

## Response Shape

Success:

```json
{
  "success": true,
  "notificationDispatched": true
}
```

Error:

```json
{
  "success": false,
  "errorKey": "orderVerification.errors.notFound",
  "error": "Order verification not found",
  "requestId": "..."
}
```
