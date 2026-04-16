### 舊版安全性審計 — 14 項現代化前後對照表

#### 關鍵風險 (Critical 1–5)

**發現 1 — 寫入與分析路由缺乏一致 JWT 驗證**

* **現代化前：** create / update / analysis / upload 路由在遺留流程中存在保護邊界不一致風險。
* **現代化後：** 關鍵路由統一經 `authJWT`，缺少、過期、篡改、格式錯誤 token 一律 `401`。

---

**發現 2 — pet 操作存在水平越權 (IDOR) 風險**

* **現代化前：** 若僅依 `petId` 查詢/更新，可能允許跨用戶修改寵物資料。
* **現代化後：** `loadAuthorizedPet` 強制 owner / NGO ownership 檢查，非持有人回 `403 eyeUpload.forbidden`。

---

**發現 3 — NGO 授權語意不完整可能造成越權**

* **現代化前：** 缺乏一致 NGO 身分與 claim 驗證時，可能讓不具資格請求進入寫入路徑。
* **現代化後：** 對 NGO 分支強制檢查 `ngo` 角色與必要 claim，不符即 `403`（如 `eyeUpload.ngoRoleRequired` / `eyeUpload.ngoIdClaimRequired`）。

---

**發現 4 — client-supplied identity 欄位可造成批量賦值**

* **現代化前：** 若接受客戶端 `userId` 或未知欄位，可能覆寫治理欄位。
* **現代化後：** create/update/breed-analysis 以 strict schema 驗證，未知欄位拒絕並回 `400 eyeUpload.unknownField`。

---

**發現 5 — 檔案上傳路由缺乏路徑限制可導致路徑穿越/任意鍵注入**

* **現代化前：** 若未限制 folder/key，可能被利用寫入非預期路徑。
* **現代化後：** `uploadPetBreedImage` 僅允許 allowlist 路徑並拒絕 `.` / `..` 片段，非法 folder 回 `400 eyeUpload.invalidFolder`。

---

#### 高嚴重性 (High Severity 6–10)

**發現 6 — ObjectId 驗證不足導致錯誤放大**

* **現代化前：** path/body ObjectId 未前置檢查時，異常輸入可能進入 DB 查詢。
* **現代化後：** ObjectId 先行 guard 驗證，不合法直接 `400 eyeUpload.invalidObjectId`。

---

**發現 7 — JSON 與 multipart 輸入邊界不足**

* **現代化前：** malformed JSON、空 body、缺少檔案等情境處理不一致。
* **現代化後：** 對 JSON 與 multipart 皆有前置 guard；錯誤情境明確回 `400`/`413` 對應 `errorKey`。

---

**發現 8 — 上傳格式驗證不足可能導致惡意檔案進入流程**

* **現代化前：** 若未嚴格檢查 content-type/檔案數量，易被繞過。
* **現代化後：** 上傳路由限制格式與檔案數量；不符回 `eyeUpload.invalidImageFormat` / `eyeUpload.tooManyFiles`。

---

**發現 9 — 缺乏路由級限流易遭濫用**

* **現代化前：** 寫入與上傳若無限流，容易被自動化請求耗盡資源。
* **現代化後：** 6 個 active routes 全部套用 Mongo-backed rate limiting，超限回 `429 eyeUpload.rateLimited`。

---

**發現 10 — dead routes 若未明確拒絕可能誤觸遺留邏輯**

* **現代化前：** 遺留路徑若未顯式封鎖，存在被誤調用與語意漂移風險。
* **現代化後：** `PUT /pets/updatePetEye`、`GET /pets/gets3Image`、`POST /pets/create-pet-basic-info` 明確回 `405 others.methodNotAllowed`。

---

#### 中等嚴重性 (Medium Severity 11–12)

**發現 11 — 錯誤回應格式不一致影響前端處理與追蹤**

* **現代化前：** 不同錯誤分支缺乏一致的 machine-readable 結構。
* **現代化後：** 錯誤統一為 `success: false`、`errorKey`、`error`、`requestId`。

---

**發現 12 — CORS 行為不明確造成跨來源探測風險**

* **現代化前：** 預檢與來源限制不一致時，容易暴露不必要跨域面。
* **現代化後：** OPTIONS 路由行為一致，未知來源拒絕。

---

#### 架構風險 (Structural Risk 13–14)

**發現 13 — 單體檔案過大導致安全修補易回歸**

* **現代化前：** 1000+ 行單體將驗證、路由、上傳與業務邏輯混雜，調整高風險。
* **現代化後：** 拆分為 handler/router/middleware/config/service/utils/schema 模組化結構，降低回歸機率。

---

**發現 14 — 契約鍵值漂移會造成前端誤判**

* **現代化前：** 驗證層調整可能導致 `errorKey` 漂移，破壞既有前端錯誤分流。
* **現代化後：** Zod 4 標準化同時保留 `eyeUpload.*` 合約鍵值，降低前後端契約不一致風險。
