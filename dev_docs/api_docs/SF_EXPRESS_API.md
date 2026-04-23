# SF Express Logistics API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Wrappers over the SF Express waybill and address APIs for our admin / NGO / staff users. All endpoints require Bearer JWT.

> Conventions: [README.md](./README.md).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/sf-express-routes/create-order` | Create SF waybill + update linked Order |
| POST | `/sf-express-routes/get-token` | Fetch SF Address API bearer token |
| POST | `/sf-express-routes/get-area` | List SF area metadata |
| POST | `/sf-express-routes/get-netCode` | List SF net codes for a type + area |
| POST | `/sf-express-routes/get-pickup-locations` | Pickup points for one or more net codes |
| POST | `/v2/sf-express-routes/print-cloud-waybill` | Request cloud-print PDF + email |

**Lambda:** SFExpressRoutes

**Auth:** Bearer JWT (HS256). Privileged roles that bypass SF order email-ownership checks: `admin`, `ngo`, `staff`, `developer`. Request bodies are JSON with schema `.strict()` — unknown fields rejected.

---

### POST /sf-express-routes/create-order

Create a shipment in SF's system and persist the returned waybill number onto any Orders linked via `tempId` / `tempIdList`.

**Rate limit:** 20 / 300 s per `{clientIP}:{userId|userEmail}`.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `lastName` | string | Yes | Receiver last name |
| `phoneNumber` | string | Yes | Receiver phone |
| `address` | string | Yes | Receiver address |
| `count` | number | No | Positive integer, default `1` |
| `attrName` | string | No | |
| `netCode` | string | No | |
| `tempId` | string | No | Single linked Order |
| `tempIdList` | string[] | No | Multiple linked Orders |

**Authorization of linked orders:** if `tempId` or `tempIdList` is supplied, non-privileged callers must own the orders (`Order.email === event.userEmail`). Otherwise `403 others.unauthorized`.

**Success (200):**

```json
{
  "success": true,
  "message": "Order created and saved",
  "tempIdList": ["T-001", "T-002"],
  "trackingNumber": "SF1234567890"
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 400 | `sfExpressRoutes.errors.validation.lastNameRequired` / `sfExpressRoutes.errors.validation.phoneNumberRequired` / `sfExpressRoutes.errors.validation.addressRequired` | Required field missing |
| 401 | `common.unauthorized` | Missing / invalid JWT |
| 403 | `common.unauthorized` | Non-privileged caller doesn't own linked order |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | Missing `SF_CUSTOMER_CODE` / `SF_PRODUCTION_CHECK_CODE` env or unhandled error |
| 500 | `sfExpressRoutes.errors.sfApiError` | SF API returned non-`A1000` or HTTP error |
| 500 | `sfExpressRoutes.errors.missingWaybill` | SF response missing waybill number |

---

### POST /sf-express-routes/get-token

Fetch an address-API bearer token used by the other address endpoints below.

**Rate limit:** 10 / 300 s.

**Body:** Empty JSON object `{}` (body is required but has no fields).

**Success (200):**

```json
{ "success": true, "bearer_token": "eyJhbGc..." }
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `common.missingParams` / `common.invalidJSON` | |
| 401 | `common.unauthorized` | |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | Missing `SF_ADDRESS_API_KEY` or upstream failure |

---

### POST /sf-express-routes/get-area

**Rate limit:** 30 / 300 s.

**Body:**

| Field | Type | Required |
| --- | --- | --- |
| `token` | string | Yes (from `/get-token`) |

**Success (200):**

```json
{ "success": true, "area_list": [ { "areaId": 1, "areaName": "Hong Kong" } ] }
```

`area_list` is the pass-through `data` field from SF.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `sfExpressRoutes.errors.validation.tokenRequired` | |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 401 | `common.unauthorized` | |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | Upstream error |

---

### POST /sf-express-routes/get-netCode

**Rate limit:** 30 / 300 s.

**Body:**

| Field | Type | Required |
| --- | --- | --- |
| `token` | string | Yes |
| `typeId` | string \| number | Yes |
| `areaId` | string \| number | Yes |

**Success (200):**

```json
{ "success": true, "netCode": [ { "netCode": "852A", "netName": "Hong Kong" } ] }
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `sfExpressRoutes.errors.validation.tokenRequired` / `sfExpressRoutes.errors.validation.typeIdRequired` / `sfExpressRoutes.errors.validation.areaIdRequired` | |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 401 | `common.unauthorized` | |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | |

---

### POST /sf-express-routes/get-pickup-locations

Fetches pickup addresses for each net code in parallel.

**Rate limit:** 30 / 300 s.

**Body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `token` | string | Yes | |
| `netCode` | string[] | Yes | Min 1 non-empty element |
| `lang` | string | No | Default `"en"` |

**Success (200):**

```json
{
  "success": true,
  "addresses": [
    [ { "addressId": 123, "addressName": "Pickup Point A" } ],
    [ { "addressId": 124, "addressName": "Pickup Point B" } ]
  ]
}
```

`addresses[i]` corresponds to `netCode[i]`.

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `sfExpressRoutes.errors.validation.tokenRequired` | |
| 400 | `sfExpressRoutes.errors.validation.netCodeListRequired` | Missing / empty / invalid elements |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 401 | `common.unauthorized` | |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | |

---

### POST /v2/sf-express-routes/print-cloud-waybill

Requests SF's cloud-print PDF for a waybill, then emails the PDF to `notification@ptag.com.hk`.

**Rate limit:** 20 / 300 s.

**Body:**

| Field | Type | Required |
| --- | --- | --- |
| `waybillNo` | string | Yes |

**Success (200):**

```json
{ "success": true, "waybillNo": "SF1234567890" }
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `sfExpressRoutes.errors.validation.waybillNoRequired` | |
| 400 | `common.invalidJSON` / `common.missingParams` | |
| 401 | `common.unauthorized` | |
| 429 | `common.rateLimited` | |
| 500 | `common.internalError` | Missing SF / SMTP env vars |
| 500 | `sfExpressRoutes.errors.sfApiError` | SF returned error |
| 500 | `sfExpressRoutes.errors.missingPrintFile` | No files in SF response |
| 500 | `sfExpressRoutes.errors.emailFailed` | SMTP send failure |
