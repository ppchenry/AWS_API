### API Documentation: Get NGO Pet List (Paginated)

This endpoint retrieves a list of pets associated with a specific NGO. It includes soft-delete filtering and built-in pagination to ensure high performance.

---


#### **Endpoint Overview**
* **URL:** `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev/pets/pet-list-ngo/{ngoId}`
* **Method:** `GET`
* **Authentication:** Not Required (Public)
* **Content-Type:** `application/json`
* **x-api-key header:** **Required** (Requests without this header will be rejected with 403 Forbidden by API Gateway)

---


#### **Request Parameters**


**1. Path Parameters**
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `ngoId` | `string` | **Yes** | The unique identifier of the NGO. |

**2. Headers**
| Header | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `x-api-key` | `string` | **Yes** | API Gateway key required for authentication. |

**3. Query Parameters**
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | `number` | No | `1` | The page number to retrieve. |

---

#### **Success Response**

**Code:** `200 OK`

**Body Structure:**
| Field | Type | Description |
| :--- | :--- | :--- |
| `message` | `string` | Status message (localized). |
| `pets` | `array` | Array of Pet objects. |
| `total` | `number` | Total number of non-deleted pets available for this NGO. |
| `currentPage` | `number` | The page currently being returned. |
| `perPage` | `number` | Number of items returned per page (Fixed at 30). |

**Sample Body:**
```json
{
  "message": "Success",
  "pets": [
    {
      "_id": "65f1a...",
      "ngoId": "ngo_123",
      "name": "Buddy",
      "species": "Dog",
      "deleted": false,
      "updatedAt": "2026-04-08T10:00:00Z"
    }
  ],
  "total": 125,
  "currentPage": 1,
  "perPage": 30
}
```

---

#### **Error Responses**

| Code | Key | Description |
| :--- | :--- | :--- |
| **400** | `ngoPath.missingNgoId` | The `ngoId` parameter was not provided in the URL. |
| **404** | `ngoPath.noPetsFound` | No active pets were found for the provided NGO ID. |
| **500** | `Internal Server Error` | Unexpected server-side failure. |

---

#### **Technical Constraints & Logic**
* **Pagination:** Results are limited to **30 items per page**.
* **Filtering:** Automatically filters out documents where `deleted: true`.
* **Sorting:** Results are sorted by `updatedAt` in **descending order** (Newest entries first).
* **Performance:** Uses `.lean()` execution to reduce Lambda memory overhead and database latency.