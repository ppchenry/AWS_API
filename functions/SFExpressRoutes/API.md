# SFExpressRoutes API

## Overview

`SFExpressRoutes` handles SF Express shipment creation, pickup metadata lookup, and cloud-waybill PDF delivery.

All non-`OPTIONS` routes require JWT authentication. The handler lifecycle is:

1. CORS preflight
2. JWT authentication
3. request guard and JSON parsing
4. MongoDB connection bootstrap
5. exact route dispatch
6. service execution

## Authorization

- Valid Bearer JWT is required for every active route.
- JWT verification is HS256-only.
- `JWT_BYPASS=true` is supported only outside production.
- `POST /sf-express-routes/create-order` enforces order ownership when `tempId` or `tempIdList` is supplied.
- `admin`, `ngo`, `staff`, and `developer` roles bypass the create-order tempId ownership check.
- Non-privileged callers may only update orders whose stored `email` matches the JWT email claim.

## Routes

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/sf-express-routes/create-order` | required | Create an SF order and persist the returned waybill number into matching order documents. |
| `POST` | `/v2/sf-express-routes/print-cloud-waybill` | required | Generate an SF cloud waybill PDF and email it to `notification@ptag.com.hk`. |
| `POST` | `/sf-express-routes/get-token` | required | Obtain an SF address-service bearer token. |
| `POST` | `/sf-express-routes/get-area` | required | Fetch SF pickup area list. |
| `POST` | `/sf-express-routes/get-netCode` | required | Fetch SF netCode list for a selected type and area. |
| `POST` | `/sf-express-routes/get-pickup-locations` | required | Fetch pickup address lists for one or more netCode values. |

Unsupported methods and unknown exact route keys return `405 others.methodNotAllowed`.

## Request Bodies

### POST /sf-express-routes/create-order

Required fields:

- `lastName`
- `phoneNumber`
- `address`

Optional fields:

- `count` positive integer, defaults to `1`
- `attrName`
- `netCode`
- `tempId`
- `tempIdList`

```json
{
  "lastName": "Chan",
  "phoneNumber": "91234567",
  "address": "Hong Kong address",
  "count": 1,
  "attrName": "PickupLocationCode",
  "netCode": "852A",
  "tempId": "TEMP_123",
  "tempIdList": ["TEMP_123", "TEMP_456"]
}
```

Success:

```json
{
  "success": true,
  "message": "Order created and saved",
  "tempIdList": ["TEMP_123", "TEMP_456"],
  "trackingNumber": "SF1234567890"
}
```

### POST /v2/sf-express-routes/print-cloud-waybill

Required fields:

- `waybillNo`

```json
{
  "waybillNo": "SF1234567890"
}
```

Success:

```json
{
  "success": true,
  "waybillNo": "SF1234567890"
}
```

### POST /sf-express-routes/get-token

Request body is optional. Empty body and `{}` are both accepted.

Success:

```json
{
  "success": true,
  "bearer_token": "..."
}
```

### POST /sf-express-routes/get-area

Required fields:

- `token`

```json
{
  "token": "..."
}
```

Success:

```json
{
  "success": true,
  "area_list": []
}
```

### POST /sf-express-routes/get-netCode

Required fields:

- `token`
- `typeId`
- `areaId`

`typeId` and `areaId` may be strings or numbers.

```json
{
  "token": "...",
  "typeId": 1,
  "areaId": 2
}
```

Success:

```json
{
  "success": true,
  "netCode": []
}
```

### POST /sf-express-routes/get-pickup-locations

Required fields:

- `token`
- `netCode` non-empty string array

Optional fields:

- `lang`, defaults to `en`

```json
{
  "token": "...",
  "netCode": ["852A", "852B"],
  "lang": "en"
}
```

Success:

```json
{
  "success": true,
  "addresses": []
}
```

## Rate Limits

Rate-limit identity is `userId`, then `userEmail`, then `anonymous`.

| Route | Limit |
| --- | --- |
| `POST /sf-express-routes/get-token` | 10 requests per 300 seconds |
| `POST /sf-express-routes/create-order` | 20 requests per 300 seconds |
| `POST /v2/sf-express-routes/print-cloud-waybill` | 20 requests per 300 seconds |
| Metadata routes `get-area`, `get-netCode`, `get-pickup-locations` | 30 requests per 300 seconds |

Rate-limit exhaustion returns `429 others.rateLimited`.

## Error Response Shape

```json
{
  "success": false,
  "errorKey": "sfExpress.validation.addressRequired",
  "error": "Address is required",
  "requestId": "aws-request-id"
}
```

`error` is translated from locale bundles. `SFExpressRoutes` defaults to `zh` unless `cookies.language` or `queryStringParameters.lang` is supplied.

## Common Error Keys

| errorKey | Meaning |
| --- | --- |
| `others.unauthorized` | Missing, invalid, expired, or unauthorized JWT. |
| `others.invalidJSON` | Request body is malformed JSON. |
| `others.missingParams` | Body is required and empty. |
| `others.methodNotAllowed` | No exact route match for method and resource. |
| `others.rateLimited` | Rate limit exceeded. |
| `others.internalError` | Internal failure or missing service configuration. |
| `sfExpress.validation.lastNameRequired` | `lastName` is missing or empty. |
| `sfExpress.validation.phoneNumberRequired` | `phoneNumber` is missing or empty. |
| `sfExpress.validation.addressRequired` | `address` is missing or empty. |
| `sfExpress.validation.waybillNoRequired` | `waybillNo` is missing or empty. |
| `sfExpress.validation.tokenRequired` | Metadata token is missing or empty. |
| `sfExpress.validation.typeIdRequired` | `typeId` is missing. |
| `sfExpress.validation.areaIdRequired` | `areaId` is missing. |
| `sfExpress.validation.netCodeListRequired` | `netCode` is missing or empty. |
| `sfExpress.errors.sfApiError` | Upstream SF API returned an error. |
| `sfExpress.errors.invalidSfResponse` | SF response shape is invalid. |
| `sfExpress.errors.missingWaybill` | Create-order response did not include a waybill number. |
| `sfExpress.errors.missingPrintFile` | Cloud-print response did not include a downloadable file. |

## Environment

Required at startup:

- `MONGODB_URI`
- `JWT_SECRET`
- `ALLOWED_ORIGINS`

Optional at startup but required by specific service actions:

- `SF_CUSTOMER_CODE`
- `SF_PRODUCTION_CHECK_CODE`
- `SF_SANDBOX_CHECK_CODE`
- `SF_ADDRESS_API_KEY`
- `SMTP_FROM`
- `SMTP_HOST`
- `SMTP_PASS`
- `SMTP_PORT`
- `SMTP_USER`
