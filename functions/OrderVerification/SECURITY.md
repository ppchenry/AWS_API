### 舊版安全性審計 — 11 項現代化前後對照表

#### 關鍵風險 (Critical 1–4)

**發現 1 — 訂單核實路由缺乏 JWT 驗證**

* **現代化前：** 訂單查詢、廠商資訊、標籤更新等路由未要求有效 JWT，未認證的呼叫者可直接存取訂單資料。
* **現代化後：** `authJWT({ event })` 無條件呼叫，`PUBLIC_RESOURCES = []` 表示所有路由均需有效 JWT。缺少標頭、過期、簽名遭篡改或 `alg:none` 攻擊均直接回傳 `401`。

---

**發現 2 — 路由缺乏 DB-backed 所有權驗證**

* **現代化前：** 廠商資訊（supplier）、訂單資訊（ordersInfo）、WhatsApp 連結等路由若僅依路徑參數查詢，任意已認證用戶可存取他人的訂單資料。
* **現代化後：** `supplier`、`ordersInfo`、`whatsapp-order-link` 路由在 Service 層執行 DB-backed ownership check，確認記錄歸屬於當前 JWT 的 `userId`；不符合者拒絕操作。

---

**發現 3 — 刪除路由未正式關閉，存在意外復活風險**

* **現代化前：** `DELETE /v2/orderVerification/{tagId}` 若仍存在於程式碼中，未來 API Gateway 配置變更時可能意外重新啟用刪除操作，對訂單資料完整性構成風險。
* **現代化後：** 刪除路由在 Router 對應表中被明確設為 `null`（tombstone 模式），任何呼叫均回傳 `405 others.methodNotAllowed`，無法再觸達刪除邏輯。

---

**發現 4 — 路徑參數未先驗證 ObjectId 格式**

* **現代化前：** 非法 `_id` 格式可直接進入 Mongoose 查詢，造成 `CastError` 並潛在洩漏內部錯誤細節。
* **現代化後：** Guard 層對 `/v2/orderVerification/whatsapp-order-link/{_id}` 路由呼叫 `isValidObjectId(event.pathParameters?._id)` 進行前置驗證；無效格式直接回傳 `400 orderVerification.errors.invalidVerificationId`，不進入 DB 層。

---

#### 高嚴重性 (High Severity 5–8)

**發現 5 — JSON 與 Body 驗證邊界不足**

* **現代化前：** malformed JSON 或空 body 可能在深層業務邏輯才失敗，造成非預期的 500 錯誤或資訊洩漏。
* **現代化後：** Guard 層對 malformed JSON 回傳 `400 others.invalidJSON`；`BODY_REQUIRED_ROUTES`（`PUT /v2/orderVerification/supplier/{orderId}`、`PUT /v2/orderVerification/{tagId}`）缺少 body 時回傳 `400 others.missingParams`。

---

**發現 6 — Multipart 請求未特殊處理，造成 JSON 解析衝突**

* **現代化前：** 若 multipart form-data 請求進入 JSON 解析邏輯，會造成解析失敗或回應不一致。
* **現代化後：** Handler 使用 `isMultipartRequest(event)` 檢查 `content-type` header（不區分大小寫），multipart 請求跳過 JSON 解析並採用原始 body 空值檢查，確保上傳操作不被誤當 JSON 處理。

---

**發現 7 — 重複 orderId 更新未作衝突偵測**

* **現代化前：** 對同一 `orderId` 重複執行更新操作可能造成資料覆蓋或狀態不一致，且無明確錯誤提示。
* **現代化後：** 重複 `orderId` 更新回傳 `409 orderVerification.duplicateOrderId`，確保每個訂單 ID 的更新具有冪等性保護。

---

**發現 8 — 回應未使用 Allowlist Projection，可能洩漏敏感欄位**

* **現代化前：** 回應直接回傳原始 DB 文件，`discountProof` 等敏感欄位可能被包含在回應中洩漏給前端。
* **現代化後：** Service 層使用 allowlisted projection 與 sanitizer，確保 `discountProof` 等敏感欄位不出現在客戶端回應中。

---

#### 中等嚴重性 (Medium Severity 9–11)

**發現 9 — WhatsApp 通知失敗影響訂單狀態更新**

* **現代化前：** 若 WhatsApp tracking dispatch 與 DB 更新耦合，provider 端失敗可能導致成功的訂單更新被回滾，造成資料狀態不一致。
* **現代化後：** WhatsApp tracking dispatch 與 DB update 解耦隔離；provider 失敗不回滾成功的 DB 更新，兩者的結果分別記錄於結構化日誌。

---

**發現 10 — CORS 邊界不一致造成跨來源暴露**

* **現代化前：** 預檢處理不一致時，包含訂單資料的路由可能被非允許來源探測或調用。
* **現代化後：** OPTIONS 對未知來源回傳 `403`，允許來源才回傳 `204` 與對應 CORS header。

---

**發現 11 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 回應格式不統一，前端或監控難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`（`orderVerification.*` 命名空間）、`error` 訊息及 `requestId`。
