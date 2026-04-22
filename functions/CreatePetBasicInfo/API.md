# CreatePetBasicInfo API

## Route

### `POST /pets/create-pet-basic-info`

Create a new pet record for the authenticated caller.

Auth: Required (JWT)

Ownership:

- Pet ownership is derived from the JWT caller identity.
- Client-supplied `userId` is rejected; ownership is always taken from the JWT caller.

Rate limit: 20 requests per 5 minutes per caller/IP key.

Request body:

```json
{
  "lang": "zh",
  "name": "Milo",
  "birthday": "2024-01-10",
  "weight": 5.2,
  "sex": "male",
  "sterilization": true,
  "animal": "cat",
  "breed": "British Shorthair",
  "features": "white paws",
  "info": "friendly",
  "status": "active",
  "breedimage": ["https://example.com/pet.jpg"],
  "tagId": "TAG-123",
  "receivedDate": "10/01/2024"
}
```

Notes:

- Required fields: `name`, `birthday`, `sex`, `animal`
- Allowed date formats: `YYYY-MM-DD`, ISO datetime, or `DD/MM/YYYY`
- `tagId` must be a string when provided
- `weight` must be a JSON number when provided
- `sterilization` must be a JSON boolean when provided
- `breedimage` must be an array of HTTP(S) URL strings when provided
- Unknown fields are rejected with `400 unknownField`
- Invalid JSON returns `400 others.invalidJSON`
- Duplicate prevention for `tagId` still depends on a MongoDB unique index to eliminate create-time race windows

Success response:

```json
{
  "success": true,
  "message": "Pet added successfully",
  "id": "66259e908d638c4cb85f38a2",
  "result": {
    "_id": "66259e908d638c4cb85f38a2",
    "name": "Milo",
    "birthday": "2024-01-10T00:00:00.000Z",
    "sex": "male",
    "animal": "cat",
    "tagId": "TAG-123"
  }
}
```

Error response shape:

```json
{
  "success": false,
  "errorKey": "others.unauthorized",
  "error": "Unauthorized",
  "requestId": "..."
}
```
