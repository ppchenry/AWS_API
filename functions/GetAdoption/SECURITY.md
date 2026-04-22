### 舊版安全性審計 — 9 項現代化前後對照表

#### 關鍵風險 (Critical 1–2)

**發現 1 — 搜尋欄位缺乏 Regex Escape，存在 ReDoS 攻擊風險**

* **現代化前：** `search` query parameter 直接傳入 MongoDB `$regex` 查詢，攻擊者可構造惡意正則表達式（如 `(a+)+`）觸發指數級回溯，導致 DB 查詢長時間阻塞並造成服務降級。
* **現代化後：** Service 層呼叫 `escapeRegex(query.search)` 對搜尋字串進行轉義後再構造 `{ $regex: safeSearch, $options: "i" }`，使任何用戶輸入均被視為字面字串而非正則語法。

---

**發現 2 — 搜尋欄位缺乏長度限制，oversized 輸入可觸達 DB 查詢**

* **現代化前：** `search` 參數無長度限制，攻擊者可傳入超長字串增加 regex 匹配成本或造成 index 掃描壓力。
* **現代化後：** Guard 層限制 `search` 最大長度為 100 字元；超長時直接回傳 `400 adoption.invalidSearch`，不進入 DB 查詢層。

---

#### 高嚴重性 (High Severity 3–7)

**發現 3 — 分頁 page 參數未驗證，非正整數可進入 MongoDB 查詢**

* **現代化前：** `page=0`、`page=-1`、`page=abc` 等無效值可直接影響 `skip()` 計算，造成非預期的查詢行為或 DB 錯誤。
* **現代化後：** Guard 層使用 `parsePositiveInteger(queryParams.page)` 驗證，非正整數或非數字值直接回傳 `400 adoption.invalidPage`；`page` 缺失時預設為 `1`。

---

**發現 4 — 回應回傳原始 DB 文件，`__v` 等內部欄位洩漏**

* **現代化前：** 查詢結果直接序列化回傳，`__v`、`parsedDate` 等 Mongoose 內部或計算欄位出現在 API 回應中，洩漏 DB schema 細節。
* **現代化後：** 列表查詢套用 `LIST_PROJECTION = { _id, Name, Age, Sex, Breed, Image_URL }`；詳情查詢套用 `DETAIL_PROJECTION = { _id, Name, Age, Sex, Breed, Image_URL, Remark, AdoptionSite, URL }`；`sanitizeAdoption(adoption)` 進一步在應用層過濾 `__v` 與 `parsedDate`。

---

**發現 5 — ObjectId 格式未驗證，非法 id 可觸發 Mongoose CastError**

* **現代化前：** `GET /adoption/{id}` 對非法格式的 `id` 直接進行查詢，觸發 Mongoose `CastError` 並可能洩漏內部錯誤訊息。
* **現代化後：** Guard 層呼叫 `isValidObjectId(id)` 進行前置驗證；無效格式直接回傳 `400 adoption.invalidPetIdFormat`，不進入 DB 層。

---

**發現 6 — 特定收容所資料來源未過濾，外部資料品質問題可影響 API 輸出**

* **現代化前：** 所有收容所資料不加區分地出現在 API 回應中，包括資料品質不一或不適合對外展示的來源。
* **現代化後：** `EXCLUDED_SITES = ["Arc Dog Shelter", "Tolobunny", "HKRABBIT"]` 硬編碼於查詢的 `$nin` 過濾中，在 DB 層即排除特定來源，不依賴應用層後處理。

---

**發現 7 — 路由分發缺乏明確 405 回應**

* **現代化前：** 未在對應表中的 `routeKey`（如已移除的 `POST /adoption/{id}`）可能產生非預期行為。
* **現代化後：** Router 對所有不在對應表中的 `routeKey` 統一回傳 `405 others.methodNotAllowed`；已移除路由明確記錄於 tombstone 位置。

---

#### 中等嚴重性 (Medium Severity 8–9)

**發現 8 — 公開路由設計需明確文件化，防止未來誤加 JWT 限制**

* **現代化前：** 公開路由的 JWT 豁免邏輯若依賴隱性條件，後續修改時可能意外加入 auth 保護，破壞前端合約。
* **現代化後：** `PUBLIC_RESOURCES = ["/adoption", "/adoption/{id}"]` 明確宣告，`isPublicResource` 檢查在路由分發前執行；測試套件明確驗證 `authJWT` 在 adoption 路由上從不被呼叫，防止未來回歸。

---

**發現 9 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 回應格式不統一，前端或監控難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`（`adoption.*` 命名空間）、`error` 訊息及 `requestId`。
