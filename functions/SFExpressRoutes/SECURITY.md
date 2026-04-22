### 舊版安全性審計 — 10 項現代化前後對照表

#### 關鍵風險 (Critical 1–3)

**發現 1 — 所有 SF Express 路由缺乏 JWT 驗證**

* **現代化前：** SF Express 的建單（create-order）、雲端面單列印（print-cloud-waybill）、查詢代號（get-netCode）等路由未要求有效 JWT，未認證的外部呼叫者可直接觸發貨運訂單建立，產生虛假運費記錄與倉儲操作。
* **現代化後：** `authJWT({ event })` 無條件呼叫，`PUBLIC_RESOURCES = []` 表示所有路由均需有效 JWT。缺少標頭、過期、簽名遭篡改或 `alg:none` 攻擊均直接回傳 `401`。

---

**發現 2 — SF Express API 金鑰硬編碼或透過 Body 傳入**

* **現代化前：** SF Express 地址服務的 API 金鑰存在硬編碼於程式碼或允許 Body 傳遞的風險，可能造成金鑰外洩或替換。
* **現代化後：** SF API 金鑰改為透過環境變數（`process.env.SF_API_KEY` 等）注入，不再出現於程式碼或請求主體中。地址服務呼叫使用 HTTPS。

---

**發現 3 — 建單流程缺乏 ownership 驗證**

* **現代化前：** 建單路由若僅依 body 中的 `tempId` 或 `orderId` 操作，攻擊者可使用他人的訂單 ID 觸發面單寫入，產生跨帳號的貨運記錄汙染。
* **現代化後：** Service 層在寫入 waybill 前對 `tempId` 執行 DB-backed ownership check，確認記錄歸屬於當前 JWT 的 `userId`；不符合者拒絕操作。

---

#### 高嚴重性 (High Severity 4–7)

**發現 4 — POST 路由缺乏必要 Body 強制，空請求可觸達 SF 上游 API**

* **現代化前：** 空 body 的 POST 請求可通過 Handler 並到達 SF Express 上游 API 呼叫邏輯，造成無效 API 調用或 SF 服務側錯誤。
* **現代化後：** `BODY_REQUIRED_ROUTES`（`create-order`、`get-pickup-locations`、`get-area`、`get-netCode`、`print-cloud-waybill`）對空 body 直接回傳 `400 others.missingParams`，不進入服務層。

---

**發現 5 — JSON 與 Body 驗證邊界不足**

* **現代化前：** malformed JSON 可能在深層邏輯才失敗，回應不一致且可能洩漏內部錯誤。
* **現代化後：** Guard 層對 malformed JSON 統一回傳 `400 others.invalidJSON`。

---

**發現 6 — 請求 Zod Schema 驗證缺失**

* **現代化前：** SF Express 請求欄位未經驗證直接傳遞至上游 API 呼叫，可能造成 API 格式錯誤或注入風險。
* **現代化後：** 各路由在 Service 層使用 Zod schema 驗證請求 body，欄位類型與格式不符時以結構化 `sfExpress.*` error key 回傳 `400`。

---

**發現 7 — 速率限制缺失，SF Express API 可被大量呼叫**

* **現代化前：** 高頻請求可利用已認證帳號無限制地觸發 SF Express token 取得、建單等操作，造成上游 API 配額耗盡或費用暴增。
* **現代化後：** token、metadata、create-order、cloud-waybill 等路由在 Service 層各自實施 per-action rate limiting，超限回傳 `429 others.rateLimited`。

---

#### 中等嚴重性 (Medium Severity 8–10)

**發現 8 — 上游 SF Express API 失敗未妥善隔離**

* **現代化前：** SF Express 上游 API 失敗可能導致 Handler 崩潰或洩漏上游錯誤訊息給客戶端。
* **現代化後：** Service 層對 upstream SF API failure、cloud-waybill failure、email side-effect failure 分別實施隔離處理，內部錯誤統一記錄於結構化日誌，客戶端僅接收標準 error key 回應。

---

**發現 9 — CORS 邊界不一致造成跨來源暴露**

* **現代化前：** 預檢處理不一致時，貨運操作路由可能被非允許來源探測或調用。
* **現代化後：** OPTIONS 對未知來源回傳 `403`，允許來源才回傳 `204` 與對應 CORS header。

---

**發現 10 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 錯誤回應格式不統一，前端或監控難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`（`sfExpress.*` 命名空間）、`error` 訊息及 `requestId`。
