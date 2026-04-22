### 舊版安全性審計 — 10 項現代化前後對照表

#### 關鍵風險 (Critical 1–4)

**發現 1 — 公開端點洩漏 userId、ngoId 等 PII 欄位**

* **現代化前：** `GET /pets/getPetInfobyTagId/{tagId}` 為完全公開的路由，若直接回傳 Mongoose 文件，任何持有寵物標籤 ID 的人均可獲取寵物 `userId`（飼主帳號 ID）、`ngoId`、`ownerContact1`、`ownerContact2`、`transferNGO` 等高敏感欄位，可被用於帳號定向攻擊或身份關聯。
* **現代化後：** DB 層套用 `PUBLIC_PET_PROJECTION`（排除 `_id`、`tagId`、`userId`、`ngoId`、`deleted`、`transferNGO`）；應用層再透過 `sanitizePet(pet)` 以 allowlist 進行第二層過濾，形成雙層防護，確保任何內部欄位均不出現在回應中。

---

**發現 2 — 已軟刪除寵物資料於公開端點仍可被讀取**

* **現代化前：** 查詢未過濾 `deleted` 欄位，已軟刪除（下架）的寵物記錄仍可透過標籤 ID 被公開查詢，洩漏已撤回的資料。
* **現代化後：** DB 查詢使用 `Pet.findOne({ tagId: validation.tagId, deleted: { $ne: true } })`；已刪除寵物不會被查詢命中，呼叫者接收到的是統一的 all-null 回應，而非已刪除記錄的資料。

---

**發現 3 — 不存在的 tagId 回傳 404，可被用於標籤列舉攻擊**

* **現代化前：** 若不存在的 tagId 回傳 `404` 而存在的 tagId 回傳 `200`，攻擊者可透過狀態碼差異系統性地列舉有效的標籤 ID 範圍，獲取整個標籤 ID 空間的分佈資訊。
* **現代化後：** 採用反列舉設計（Anti-enumeration pattern）：`sanitizePet(null)` 對不存在的寵物回傳所有欄位為 `null` 的結構化 `200` 回應，與正常回應具有相同的 HTTP 狀態碼與回應 shape，呼叫者無法從回應中區分「不存在」與「存在但欄位為空」。

---

**發現 4 — sanitizePet 對 null 輸入缺乏 null guard，造成 500 崩潰**

* **現代化前：** `sanitizePet(pet)` 直接呼叫 `pet.toObject()`，當 `pet` 為 `null`（標籤不存在）時觸發 `TypeError: Cannot read properties of null (reading 'toObject')`，回傳 `500` 並破壞反列舉設計。
* **現代化後：** `sanitizePet` 加入 null guard：若 `pet` 為 `null`，使用 `PUBLIC_PET_FIELDS.reduce(...)` 建構所有欄位均為 `null` 的回應物件；正常回應路徑維持不變。此為重構過程中透過測試發現並修復的 source bug。

---

#### 高嚴重性 (High Severity 5–8)

**發現 5 — 飼主聯絡資訊未依 visibility toggle 過濾**

* **現代化前：** 若 `ownerContact1`、`ownerContact2` 直接回傳，飼主可能在未意識到的情況下將聯絡資訊暴露給持有標籤的任何人，無論其是否啟用公開顯示。
* **現代化後：** `sanitizePet` 讀取 `contact1Show`、`contact2Show` 欄位（`boolean`），僅在 flag 為 `true` 時將對應聯絡欄位包含在回應中；flag 本身不回傳至客戶端。

---

**發現 6 — tagId 長度無上限，oversized 輸入可觸達 DB 查詢**

* **現代化前：** `tagId` 路徑參數無長度限制，超長字串可對資料庫標籤索引掃描造成不必要的壓力，或用於製造異常大的日誌條目。
* **現代化後：** Guard 層限制 `tagId` 最大長度為 120 字元；超長時直接回傳 `400 others.invalidPathParam`，不進入 DB 查詢層。

---

**發現 7 — 回應中包含 _id 與 tagId，可被用於 ID 反向對應**

* **現代化前：** 若回應包含 `_id` 或 `tagId`，呼叫者可建立標籤 ID 到 MongoDB ObjectId 的對應關係，為後續針對性攻擊提供資訊。
* **現代化後：** `PUBLIC_PET_PROJECTION` 明確排除 `_id` 與 `tagId`；`sanitizePet` allowlist 亦不包含這兩個欄位，回應中不回傳任何資料庫內部識別符。

---

**發現 8 — 寫入方法未強制拒絕，公開路由可能接受 POST/PUT/DELETE**

* **現代化前：** 若未做方法驗證，對公開寵物標籤路由的 POST 或 DELETE 請求可能觸發非預期的程式碼路徑。
* **現代化後：** 方法驗證明確強制：`routeKey !== "GET /pets/getPetInfobyTagId/{tagId}"` → `405 others.methodNotAllowed`；POST、PUT、DELETE 均被拒絕。

---

#### 中等嚴重性 (Medium Severity 9–10)

**發現 9 — tagId 空白或缺失時未提供明確錯誤**

* **現代化前：** 空白或缺失的 `tagId` 可能進入 DB 查詢並命中非預期記錄，或觸發 null pointer 錯誤。
* **現代化後：** Guard 層對 `tagId` 執行 `trim()` 後檢查空值 → `400 petInfoByPetNumber.errors.tagIdRequired`；空白字串在進入服務層前即被拒絕。

---

**發現 10 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 回應格式不統一，前端或監控難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`（`petInfoByPetNumber.*` 命名空間）、`error` 訊息及 `requestId`。
