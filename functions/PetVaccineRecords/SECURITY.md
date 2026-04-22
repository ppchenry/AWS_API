### 舊版安全性審計 — 13 項現代化前後對照表

#### 關鍵風險 (Critical 1–5)

**發現 1 — 疫苗記錄路由缺乏 JWT 保護**

* **現代化前：** 疫苗記錄的 GET / POST / PUT / DELETE 路由未要求有效 JWT，任意呼叫者可直接讀取或修改任何寵物的疫苗資料。
* **現代化後：** `authJWT({ event })` 無條件呼叫，`PUBLIC_RESOURCES = []` 表示所有路由均需有效 JWT。缺少標頭、過期、簽名遭篡改或 `alg:none` 攻擊均直接回傳 `401`。

---

**發現 2 — 任意已認證用戶可讀取或修改任何寵物的疫苗記錄**

* **現代化前：** 疫苗 CRUD 路由未對請求者與目標寵物的所有關係進行任何檢查，持有任意有效 JWT 即可操作任何寵物的記錄。
* **現代化後：** 所有 Service 方法（`getVaccineRecords`、`createVaccineRecord`、`updateVaccineRecord`、`deleteVaccineRecord`）均呼叫 `loadAuthorizedPet({ event, petId })`；存取條件為 JWT `userId` 符合寵物 `userId`（owner）或 JWT `ngoId` 符合寵物 `ngoId`（NGO），否則回傳 `403 others.forbidden`。

---

**發現 3 — 疫苗記錄未過濾軟刪除狀態，已刪除記錄可被讀取**

* **現代化前：** 查詢未過濾 `isDeleted` 欄位，軟刪除的疫苗記錄仍會出現在 GET 回應中，可能讓已下架的醫療資訊重新曝光。
* **現代化後：** 所有 `find`、`countDocuments` 及排序查詢均套用 `ACTIVE_VACCINE_FILTER = { isDeleted: { $ne: true } }`；軟刪除記錄不再出現在任何 GET 回應中。

---

**發現 4 — 寫入操作存在批量賦值 (Mass Assignment) 風險**

* **現代化前：** `VaccineRecords.create(body)` 直接將請求主體傳入 Mongoose，攻擊者可透過傳入 `petId`、`isDeleted`、`__v` 等內部欄位篡改記錄狀態。
* **現代化後：** 建立與更新操作使用明確的欄位逐一賦值（`VaccineRecords.create({ petId, vaccineDate, vaccineName, ... })`），僅接受 Zod 驗證後的資料欄位，任何非預期欄位均不進入 Mongoose。

---

**發現 5 — Cross-pet scope：疫苗記錄可透過錯誤的 petId 存取**

* **現代化前：** 查詢僅依 `vaccineId` 操作時，攻擊者可用寵物 A 的 `petId` 路徑搭配寵物 B 的 `vaccineId` 存取或刪除記錄，突破寵物資料隔離邊界。
* **現代化後：** 所有更新與刪除操作均以 compound 條件（`_id + petId`）執行查詢；使用錯誤 `petId` 定址的記錄無法命中，回傳 `404`。

---

#### 高嚴重性 (High Severity 6–10)

**發現 6 — 路徑參數未先驗證 ObjectId 格式**

* **現代化前：** 非法 `petId` 或 `vaccineId` 格式可直接進入 Mongoose 查詢，造成 `CastError` 與錯誤資訊洩漏。
* **現代化後：** Guard 層對 `petId` 呼叫 `isValidObjectId(petID)` → `400 invalidPetIdFormat`；對 `vaccineId`（透過 `RECORD_ID_PARAMS` 對應表）呼叫 `isValidObjectId(vaccineID)` → `400 vaccineRecord.invalidVaccineIdFormat`，不進入 DB 層。

---

**發現 7 — 日期欄位未驗證格式，可存入無效日期**

* **現代化前：** 疫苗接種日期等日期欄位直接存入資料庫，攻擊者可存入 `"day 32"` 等不合法日期造成資料品質問題或下游解析失敗。
* **現代化後：** Service 層呼叫 `isValidDateFormat(data.vaccineDate)` 進行 calendar-strict 驗證；無效日期直接回傳 `400 vaccineRecord.invalidDateFormat`。

---

**發現 8 — 回應未使用 Allowlist Projection，內部欄位可能外洩**

* **現代化前：** 直接回傳 Mongoose 文件，`petId`、`isDeleted`、`__v` 等內部欄位可能出現在客戶端回應中。
* **現代化後：** `sanitizeVaccineRecord(record)` 使用明確 allowlist（`vaccineDate`、`vaccineName`、`vaccineNumber`、`vaccineTimes`、`vaccinePosition`、`_id`）；DB 查詢同時套用 `.select()` projection，形成雙層防護。

---

**發現 9 — JSON 與 Body 驗證邊界不足**

* **現代化前：** malformed JSON 或空 body 可能在深層邏輯才失敗，造成非預期的 500 錯誤。
* **現代化後：** Guard 層對 malformed JSON 回傳 `400 others.invalidJSON`；POST 與 PUT 的空 body 回傳 `400 others.missingParams`。

---

**發現 10 — Zod Schema 驗證缺失，NoSQL 注入欄位可直達 Mongoose**

* **現代化前：** 疫苗名稱等字串欄位若未驗證類型，攻擊者可傳入 `{ "$gt": "" }` 等 operator-like object 繞過預期的業務邏輯。
* **現代化後：** `createVaccineRecordSchema.safeParse(body)` 與 `updateVaccineRecordSchema.safeParse(body)` 確保字串欄位類型正確；object 型別輸入在 schema 層即被拒絕，回傳 `400`。

---

#### 中等嚴重性 (Medium Severity 11–13)

**發現 11 — 已軟刪除寵物仍可作為疫苗操作目標**

* **現代化前：** 寵物查詢不過濾 `deleted` 狀態，已軟刪除的寵物仍可作為疫苗記錄操作的目標。
* **現代化後：** `loadAuthorizedPet` 對 `pet.deleted === true` 的情況回傳 `410 petDeleted`，有效防止對已下架寵物進行任何疫苗資料操作。

---

**發現 12 — CORS 邊界不一致造成跨來源暴露**

* **現代化前：** 預檢處理不一致時，包含敏感醫療資料的路由可能被非允許來源探測或調用。
* **現代化後：** OPTIONS 對未知來源回傳 `403`，允許來源才回傳 `204` 與對應 CORS header。

---

**發現 13 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 回應格式不統一，前端或監控系統難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`（`vaccineRecord.*` 命名空間）、`error` 訊息及 `requestId`。
