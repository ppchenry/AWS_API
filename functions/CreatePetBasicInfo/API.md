# CreatePetBasicInfo API

## Route

### `POST /pets/create-pet-basic-info`

Create a new pet record for the authenticated caller.

Auth: Required (JWT)

Ownership:

- Pet ownership is derived from the JWT caller identity.
- A legacy `userId` field may still be sent for compatibility, but it must match the JWT caller and is never trusted as the source of ownership.
- `ngoId` and `ngoPetId` are restricted to NGO callers whose JWT carries a matching `ngoId` claim.

Rate limit: 20 requests per 5 minutes per caller/IP key.

Request body:

```json
{
  "lang": "zh",
  "userId": "optional-legacy-field",
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
  "owner": "Jimmy",
  "ngoId": "ngo-123",
  "ngoPetId": "NGO-00001",
  "breedimage": ["https://example.com/pet.jpg"],
  "ownerContact1": "12345678",
  "ownerContact2": "87654321",
  "contact1Show": true,
  "contact2Show": false,
  "tagId": "TAG-123",
  "receivedDate": "10/01/2024"
}
```

Notes:

- Required fields: `name`, `birthday`, `sex`, `animal`
- Allowed date formats: `YYYY-MM-DD`, ISO datetime, or `DD/MM/YYYY`
- Unknown fields are rejected with `400 unknownField`

Success response:

```json
{
  "success": true,
  "message": "Pet added successfully",
  "id": "66259e908d638c4cb85f38a2",
  "result": {
    "_id": "66259e908d638c4cb85f38a2",
    "userId": "66259dff8d638c4cb85f389a",
    "name": "Milo"
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
