### 舊版安全性審計 — 15 項現代化前後對照表

#### 關鍵風險 (Critical 1–6)

**發現 1 — 變更型路由缺乏一致 JWT 保護**

* **現代化前：** pet-lost / pet-found / notifications 的 POST/DELETE/PUT 路由在遺留流程中存在保護邊界不一致風險。
* **現代化後：** 變更型路由一律經 `authJWT` 驗證；缺少或無效 token 直接 `401`。

---

**發現 2 — 通知路由缺乏 self-access 強制，存在越權讀寫**

* **現代化前：** 若僅依 path userId 查詢或寫入，可能讓攻擊者操作他人通知。
* **現代化後：** 通知路由強制比對 JWT userId 與 path userId，不一致即 `403 others.selfAccessDenied`。

---

**發現 3 — pet-lost 刪除缺乏所有權檢查**

* **現代化前：** 僅依 `petLostID` 操作時，可能被非持有人刪除。
* **現代化後：** DELETE 前先驗證紀錄持有人；非 owner 直接 `403`。

---

**發現 4 — pet-found 刪除缺乏所有權檢查**

* **現代化前：** 若未綁定 user context，`petFoundID` 可能被跨帳號操作。
* **現代化後：** DELETE 以持有人條件保護；跨帳號刪除被拒絕。

---

**發現 5 — 通知封存 (archive) 可跨用戶操作**

* **現代化前：** 若僅依 `notificationId` 更新，存在水平越權修改風險。
* **現代化後：** 封存更新採 compound 條件（`notificationId + userId`）；非本人請求無法命中資料。

---

**發現 6 — 建立流程缺乏速率限制，易遭自動化濫用**

* **現代化前：** pet-lost / pet-found 建立請求未限流，易被刷流量。
* **現代化後：** 建立路由導入每人每 60 秒 5 次限流，超限回 `429 others.rateLimited`。

---

#### 高嚴重性 (High Severity 7–11)

**發現 7 — 路徑參數未先驗證 ObjectId，造成錯誤放大**

* **現代化前：** 非法 path param 可進入下游查詢，增加 CastError 與資訊洩漏風險。
* **現代化後：** `petLostID`、`petFoundID`、`notificationId` 先行驗證，錯誤回 `400 others.invalidPathParam`。

---

**發現 8 — JSON / Body 驗證邊界不足**

* **現代化前：** malformed JSON 或空 body 可能在深層邏輯才失敗，回應不一致。
* **現代化後：** 前置 guard 對 malformed JSON 與缺參數請求回 `400`（`others.invalidJSON` / `others.missingParams`）。

---

**發現 9 — 通知建立流程存在 isArchived 批量賦值風險**

* **現代化前：** 若接受客戶端 `isArchived`，可繞過預期工作流直接修改狀態。
* **現代化後：** 建立流程忽略呼叫者提供的 `isArchived: true`，由服務端控制狀態欄位。

---

**發現 10 — CORS 邊界不一致造成跨來源暴露風險**

* **現代化前：** 預檢處理不一致時，敏感路由可能被非允許來源探測或調用。
* **現代化後：** OPTIONS 對未知來源回 `403`，允許來源才回 `204` 與對應 CORS header。

---

**發現 11 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 回應格式不統一，前端難以穩定分類錯誤。
* **現代化後：** 錯誤回應固定 `success: false`、`errorKey`、`error`、`requestId`，利於告警與追蹤。

---

#### 中等嚴重性 (Medium Severity 12–13)

**發現 12 — 列表回應可能包含內部欄位**

* **現代化前：** 若不做輸出清理，Mongoose 內部欄位（如 `__v`）可能外洩。
* **現代化後：** 列表回應統一排除 `__v`，降低不必要內部資訊暴露。

---

**發現 13 — 不支援方法行為不明確，增加探測面**

* **現代化前：** 未映射方法行為若不一致，攻擊者可利用行為差異做路徑探測。
* **現代化後：** 未映射方法統一拒絕（`405` 或由前層攔截），降低路由混淆。

---

#### 架構風險 (Structural Risk 14–15)

**發現 14 — 單體檔案耦合過高，安全修補易回歸**

* **現代化前：** 路由、驗證、檔案上傳、DB 邏輯耦合在大型單體，調整高風險。
* **現代化後：** 拆分為 20+ 模組（handler/router/middleware/services/utils），每層責任清晰可測。

---

**發現 15 — `mime` v4 ESM-only 相容性導致可用性風險**

* **現代化前：** `require("mime")` 在 runtime 觸發 `ERR_REQUIRE_ESM`，使上傳路徑在特定環境失效。
* **現代化後：** 改為動態 `import()` 並加上 lazy cache，恢復路由穩定性並降低運行中斷風險。
