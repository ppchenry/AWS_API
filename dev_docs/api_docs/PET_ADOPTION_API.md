# Pet Adoption API

**Base URL (Dev):** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev`

Two sets of endpoints:

- **Owner-side adoption placement records** — attached to a specific pet, managed by the pet's owner / NGO.
- **Public adoption browsing** — browse / view adoption listings sourced from partner shelters.

> Conventions: [README.md](./README.md).

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/v2/pets/{petID}/pet-adoption` | Bearer JWT (owner) | Read owner's adoption record for pet |
| POST | `/v2/pets/{petID}/pet-adoption` | Bearer JWT (owner) | Create adoption record |
| PUT | `/v2/pets/{petID}/pet-adoption/{adoptionId}` | Bearer JWT (owner) | Update adoption record |
| DELETE | `/v2/pets/{petID}/pet-adoption/{adoptionId}` | Bearer JWT (owner) | Delete adoption record |
| GET | `/adoption` | Public | Browse adoption listings |
| GET | `/adoption/{id}` | Public | View adoption detail |

---

## Owner-Side Adoption Records

Lambda: **PetDetailInfo**. Pet ownership enforced for all four endpoints (403 `others.forbidden` on mismatch).

Common error rows:

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `missingPetId` / `invalidPetIdFormat` | Path `petID` invalid |
| 400 | `petAdoption.invalidAdoptionIdFormat` | `adoptionId` invalid ObjectId |
| 401 | `others.unauthorized` | Missing / invalid JWT |
| 403 | `others.forbidden` | Not pet owner |
| 404 | `petNotFound` | Pet missing or deleted |
| 500 | `others.internalError` | |

---

### GET /v2/pets/{petID}/pet-adoption

Returns the adoption record attached to the pet (or `form: null` if none).

**Success (200):**

```json
{
  "success": true,
  "form": {
    "_id": "...",
    "petId": "...",
    "postAdoptionName": "string | null",
    "isNeutered": true,
    "NeuteredDate": "2025-03-01T00:00:00.000Z",
    "firstVaccinationDate": "...",
    "secondVaccinationDate": "...",
    "thirdVaccinationDate": "...",
    "followUpMonth1": false,
    "followUpMonth2": false,
    "followUpMonth3": false,
    "followUpMonth4": false,
    "followUpMonth5": false,
    "followUpMonth6": false,
    "followUpMonth7": false,
    "followUpMonth8": false,
    "followUpMonth9": false,
    "followUpMonth10": false,
    "followUpMonth11": false,
    "followUpMonth12": false,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "petId": "...",
  "adoptionId": "..."
}
```

---

### POST /v2/pets/{petID}/pet-adoption

**Body** (all fields optional and nullable):

| Field | Type | Notes |
| --- | --- | --- |
| `postAdoptionName` | string \| null | |
| `isNeutered` | boolean \| null | |
| `NeuteredDate` | string \| null | `DD/MM/YYYY` |
| `firstVaccinationDate` | string \| null | `DD/MM/YYYY` |
| `secondVaccinationDate` | string \| null | `DD/MM/YYYY` |
| `thirdVaccinationDate` | string \| null | `DD/MM/YYYY` |
| `followUpMonth1..12` | boolean | |

**Success (201):** Same shape as GET with populated `adoptionId`.

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petAdoption.invalidDateFormat` | Any date field fails |
| 400 | `common.invalidJSON` / `others.missingParams` | |
| 409 | `petAdoption.duplicateRecord` | Adoption record already exists |

---

### PUT /v2/pets/{petID}/pet-adoption/{adoptionId}

Update fields on an existing adoption record.

**Body:** same schema as POST, all optional.

**Success (200):** `{ success: true, petId: "...", adoptionId: "..." }`

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `petAdoption.invalidDateFormat` | |
| 400 | `petAdoption.noFieldsToUpdate` | No valid fields in body |
| 404 | `petAdoption.recordNotFound` | |

---

### DELETE /v2/pets/{petID}/pet-adoption/{adoptionId}

**Success (200):** `{ success: true, petId: "...", adoptionId: "..." }`

**Extra errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 404 | `petAdoption.recordNotFound` | |

---

## Public Adoption Browsing

Lambda: **GetAdoption**. No authentication required.

### GET /adoption

Paginated browsing list with filters.

**Page size:** **16**. Results exclude sources `["Arc Dog Shelter", "Tolobunny", "HKRABBIT"]` and only include records with non-empty `Image_URL`.

**Query params:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | number | `1` | Positive integer |
| `search` | string | — | ≤ 100 chars; regex on `Breed` / `Animal_Type` / `Remark` |
| `animal_type` | string | — | Comma-separated |
| `location` | string | — | Comma-separated; matches `AdoptionSite` |
| `sex` | string | — | Comma-separated |
| `age` | string | — | Comma-separated; valid values: `幼年` (<12mo), `青年` (12–36mo), `成年` (48–72mo), `老年` (>84mo) |
| `lang` | string | `zh` | |

**Success (200):**

```json
{
  "success": true,
  "adoptionList": [
    {
      "_id": "...",
      "Name": "Lucky",
      "Age": 24,
      "Sex": "Male",
      "Breed": "Mixed",
      "Image_URL": "https://..."
    }
  ],
  "maxPage": 8,
  "totalResult": 128
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `adoption.invalidPage` | page not positive integer |
| 400 | `adoption.invalidSearch` | search > 100 chars |
| 500 | `others.internalError` | |

---

### GET /adoption/{id}

Detail view.

**Path params:** `id` (ObjectId)

**Query params:** `lang` (default `zh`)

**Success (200):**

```json
{
  "success": true,
  "pet": {
    "_id": "...",
    "Name": "Lucky",
    "Age": 24,
    "Sex": "Male",
    "Breed": "Mixed",
    "Image_URL": "https://...",
    "Remark": "...",
    "AdoptionSite": "SPCA",
    "URL": "https://..."
  }
}
```

**Errors:**

| Status | errorKey | Cause |
| --- | --- | --- |
| 400 | `adoption.invalidPetIdFormat` | id invalid ObjectId |
| 404 | `adoption.petNotFound` | No record |
| 500 | `others.internalError` | |
