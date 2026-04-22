### 舊版安全性審計 — 13 項現代化前後對照表

#### 關鍵風險 (Critical 1–5)

**發現 1 — 變更型路由缺乏一致 JWT 保護**

* **現代化前：** pet biometric 的 register / verifyPet / GET 路由在遺留流程中可能對未攜帶有效 JWT 的請求不加以拒絕，任意呼叫者均可觸發生物特徵操作。
* **現代化後：** `authJWT({ event })` 無條件呼叫，`PUBLIC_RESOURCES = []` 表示所有路由均需有效 JWT。缺少標頭、過期、簽名遭篡改或 `alg:none` 攻擊均直接回傳 `401`。

---

**發現 2 — 任意已認證用戶可存取任何寵物的生物特徵資料**

* **現代化前：** 未對請求者的身份與目標寵物的所有者關係進行任何檢查，持有任意有效 JWT 即可讀取或覆寫任何寵物的生物特徵記錄。
* **現代化後：** Service 層呼叫 `loadAuthorizedPet({ event, petId })`，執行三方存取模型：`isOwner`（JWT `userId` 符合寵物 `userId`）、`isNgoMatch`（JWT `ngoId` 符合寵物 `ngoId`）或 `isAdmin`（`event.userRole === "admin"`）三者之一才允許存取，否則 `403 petBiometric.forbidden`。

---

**發現 3 — Body 中的 userId 與 JWT 中的 userId 不一致時未作拒絕**

* **現代化前：** Register 等寫入路由可能信任請求主體中提供的 `userId`，允許攻擊者藉由偽造 body 中的身份資訊代替他人發起操作。
* **現代化後：** Guard 層明確比對 `parsedBody.userId` 與 `event.userId`（由 JWT 注入）；不一致時直接回傳 `403 petBiometric.forbidden`，與 Body 或路徑中的其他身份欄位無關。

---

**發現 4 — 已刪除寵物仍可作為生物特徵操作目標**

* **現代化前：** 寵物查詢不過濾 `deleted` 狀態，已軟刪除的寵物仍可被查詢到並作為操作目標。
* **現代化後：** `loadAuthorizedPet` 使用 `Pet.findOne({ _id: petId, deleted: { $ne: true } })`；已刪除寵物 → `404 petBiometric.petNotFound`，有效防止已下架寵物資料被繼續操作。

---

**發現 5 — 生物特徵圖片上傳缺乏 MIME 類型白名單**

* **現代化前：** 圖片上傳未驗證 MIME 類型，攻擊者可上傳任意格式的二進制檔案並繞過前端驗證。
* **現代化後：** `detectImageMimeFromBuffer()` 從原始 buffer 識別 MIME，並比對 `ALLOWED_IMAGE_TYPES` Set（`image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/tiff`）；不符合者拒絕上傳。另有 `MAX_FILE_SIZE_MB = 10` 的檔案大小上限。

---

#### 高嚴重性 (High Severity 6–10)

**發現 6 — 路徑參數未先驗證 ObjectId 格式**

* **現代化前：** 非法 `petId` 格式可直接進入 Mongoose 查詢，造成 `CastError` 並洩漏內部錯誤細節。
* **現代化後：** Guard 層明確呼叫 `isValidObjectId(event.pathParameters?.petId)`；無效格式直接回傳 `400 petBiometric.invalidPetId`，不進入 DB 層。

---

**發現 7 — JSON 與 Body 驗證邊界不足**

* **現代化前：** malformed JSON 或空 body 可能在深層邏輯才失敗，造成非預期的 500 錯誤或資訊洩漏。
* **現代化後：** Guard 層對 malformed JSON 回傳 `400 others.invalidJSON`；`ROUTES_REQUIRING_BODY`（register / verifyPet）缺少 body 時回傳 `400 others.missingParams`。

---

**發現 8 — 生物特徵 Zod Schema 驗證缺失**

* **現代化前：** 寫入操作直接使用未驗證的 body 欄位，任意欄位可能被傳遞至 Mongoose 模型造成質量數據或 NoSQL 注入風險。
* **現代化後：** `registerPetBiometricSchema.safeParse(body)` 與 `verifyPetBiometricSchema.safeParse(body)` 在 Service 層執行；未通過 Schema 的請求統一以結構化錯誤回傳 `400`。

---

**發現 9 — 生物特徵 Register 缺乏速率限制**

* **現代化前：** Register 路由無任何限流，攻擊者可對同一寵物重複發起高頻 register 請求，造成資源消耗與資料覆蓋風險。
* **現代化後：** Service 層呼叫 `enforceRateLimit({ action: "petBiometricRegister", identifier: event.userId, limit: 10, windowSec: 300 })`；超限回傳 `429 others.rateLimited`。

---

**發現 10 — CORS 邊界不一致造成跨來源暴露**

* **現代化前：** 預檢處理不一致時，敏感路由可能被非允許來源探測或調用。
* **現代化後：** OPTIONS 對未知來源回傳 `403`，允許來源才回傳 `204` 與對應 CORS header。

---

#### 中等嚴重性 (Medium Severity 11–13)

**發現 11 — JWT Bypass 未限制於非生產環境**

* **現代化前：** 若存在 JWT bypass 機制且未對環境做判斷，可能在生產環境被意外啟用。
* **現代化後：** `JWT_BYPASS === "true"` 機制明確加上 `process.env.NODE_ENV !== "production"` 條件，生產環境下永遠執行完整 JWT 驗證。

---

**發現 12 — 路由分發缺乏死路 (Dead Route) 防護**

* **現代化前：** 路由對應表缺漏時，未定義的路徑可能產生非預期行為而非明確拒絕。
* **現代化後：** Router 對所有不在對應表中的 `routeKey` 統一回傳 `405 others.methodNotAllowed`。

---

**發現 13 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 錯誤回應格式不統一，前端或監控系統難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`、`error` 訊息及 `requestId`。
