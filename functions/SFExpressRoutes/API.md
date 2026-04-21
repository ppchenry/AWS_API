# SFExpressRoutes API

## Overview

SFExpressRoutes handles SF Express shipment integration and pickup metadata retrieval.

All routes require JWT authentication except `OPTIONS` preflight requests.

## Routes

### POST /sf-express-routes/create-order

- Auth: required
- Description: Create an SF order and persist returned waybill number into matching order documents.

Request body:

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

Success response:

```json
{
  "success": true,
  "message": "Order created and saved",
  "tempIdList": ["TEMP_123", "TEMP_456"],
  "trackingNumber": "SF1234567890"
}
```

### POST /v2/sf-express-routes/print-cloud-waybill

- Auth: required
- Description: Generate SF cloud waybill PDF and send it to the configured notification mailbox.

Request body:

```json
{
  "waybillNo": "SF1234567890"
}
```

Success response:

```json
{
  "success": true,
  "waybillNo": "SF1234567890"
}
```

### POST /sf-express-routes/get-token

- Auth: required
- Description: Obtain address API bearer token from SF address service.

Request body:

```json
{}
```

Success response:

```json
{
  "success": true,
  "bearer_token": "..."
}
```

### POST /sf-express-routes/get-area

- Auth: required
- Description: Fetch SF area list for pickup discovery.

Request body:

```json
{
  "token": "..."
}
```

Success response:

```json
{
  "success": true,
  "area_list": []
}
```

### POST /sf-express-routes/get-netCode

- Auth: required
- Description: Fetch SF netCode list for selected type and area.

Request body:

```json
{
  "token": "...",
  "typeId": 1,
  "areaId": 2
}
```

Success response:

```json
{
  "success": true,
  "netCode": []
}
```

### POST /sf-express-routes/get-pickup-locations

- Auth: required
- Description: Fetch pickup addresses for one or more netCode values.

Request body:

```json
{
  "token": "...",
  "netCode": ["852A", "852B"],
  "lang": "en"
}
```

Success response:

```json
{
  "success": true,
  "addresses": []
}
```

## Error Response Shape

All errors return:

```json
{
  "success": false,
  "errorKey": "others.internalError",
  "error": "translated or fallback message",
  "requestId": "aws-request-id"
}
```
