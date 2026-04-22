### 舊版安全性審計 — 11 項現代化前後對照表

#### 關鍵風險 (Critical 1–4)

**發現 1 — 訂單管理路由缺乏 RBAC 角色控管**

* **現代化前：** `/purchase/orders`、`/purchase/order-verification` 等訂單查詢與操作路由未對使用者角色進行任何限制，任意已認證用戶均可存取所有訂單資料或執行驗證操作。
* **現代化後：** Guard 層定義 `ADMIN_ONLY_RESOURCES`，包含 `/purchase/orders`、`/purchase/order-verification`、`/purchase/order-verification/{orderVerificationId}`、`/purchase/send-ptag-detection-email`。對 `event.userRole !== "admin" && event.userRole !== "developer"` 的請求直接回傳 `403 others.unauthorized`，在 DB 連線建立前即完成拒絕。

---

**發現 2 — 受保護路由缺乏 JWT 驗證**

* **現代化前：** 付款確認與店鋪資訊以外的管理路由可能在未提供有效 JWT 的情況下被呼叫。
* **現代化後：** `authJWT({ event })` 無條件呼叫；`PUBLIC_RESOURCES = ["/purchase/confirmation", "/purchase/shop-info"]` 明確定義唯二公開路由，其餘所有路由均需有效 JWT。

---

**發現 3 — 廢棄路由未正式關閉，存在意外復活風險**

* **現代化前：** `/purchase/get-presigned-url`、`/purchase/whatsapp-SF-message` 等已廢棄路由若仍存在於程式碼中，未來 API Gateway 配置變更時可能意外重新路由到舊邏輯。
* **現代化後：** 廢棄路由在 Router 對應表中被明確設為 `null`（tombstone 模式），保留鍵值以防止未來意外重啟，但任何呼叫均回傳 `405 others.methodNotAllowed`。

---

**發現 4 — 路徑參數未先驗證 ObjectId 格式**

* **現代化前：** 非法 `orderVerificationId` 格式可直接進入 Mongoose 查詢，造成 `CastError` 並潛在洩漏內部堆疊資訊。
* **現代化後：** Guard 層呼叫 `mongoose.isValidObjectId(orderVerificationId)` 進行前置驗證；無效格式直接回傳 `400 others.invalidObjectId`，不進入 DB 層。

---

#### 高嚴重性 (High Severity 5–8)

**發現 5 — JSON 與 Body 驗證邊界不足**

* **現代化前：** malformed JSON 或空 body 可能在深層業務邏輯才失敗，回應不一致且可能洩漏內部錯誤細節。
* **現代化後：** Guard 層對 malformed JSON 回傳 `400 others.invalidJSON`；`BODY_REQUIRED_ROUTES` 對必要 body 缺失的路由回傳 `400 others.missingParams`。

---

**發現 6 — Multipart 請求未特殊處理，造成 JSON 解析衝突**

* **現代化前：** 若 multipart form-data 請求進入 JSON 解析邏輯，會造成解析失敗或非預期行為。
* **現代化後：** Handler 檢查 `contentType.includes("multipart/form-data")` 並跳過 JSON 解析，確保 multipart 請求不被誤當 JSON 處理。

---

**發現 7 — CORS 邊界不一致造成跨來源暴露**

* **現代化前：** 預檢處理不一致時，包含訂單資料的路由可能被非允許來源探測或調用。
* **現代化後：** OPTIONS 對未知來源回傳 `403`，允許來源才回傳 `204` 與對應 CORS header。

---

**發現 8 — 路由分發缺乏明確 405 回應**

* **現代化前：** 未在對應表中的 `routeKey` 可能產生非預期行為而非明確拒絕。
* **現代化後：** Router 對所有不在對應表中的 `routeKey` 統一回傳 `405 others.methodNotAllowed`。

---

#### 中等嚴重性 (Medium Severity 9–11)

**發現 9 — 公開路由政策未明確白名單化**

* **現代化前：** 公開與受保護路由的邊界依賴程式碼中的條件判斷，容易因後續修改導致邊界擴大。
* **現代化後：** `PUBLIC_RESOURCES` 陣列明確宣告唯二公開路由，非陣列成員的路由均需 JWT，減少誤加入公開路由的風險。

---

**發現 10 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 回應格式不統一，前端或監控系統難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`、`error` 訊息及 `requestId`。

---

**發現 11 — 原始內部錯誤訊息洩漏給客戶端**

* **現代化前：** Catch 區塊直接回傳 `e.message`，可能洩漏 Mongoose 查詢細節或系統架構資訊。
* **現代化後：** 所有未處理異常統一回傳 `others.internalError`；詳細錯誤資訊僅記錄於結構化日誌中，不對外顯示。
