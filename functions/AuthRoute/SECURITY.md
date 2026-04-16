### 舊版安全性審計 — 10 項現代化前後對照表

#### 關鍵風險 (Critical 1–4)

**發現 1 — Refresh 入口缺乏一致的憑證檢查與錯誤語意**

* **現代化前：** 遺留實作對 refresh cookie 的缺失、格式錯誤與失效情境缺少一致處理，容易造成驗證行為不穩定。
* **現代化後：** `refreshSession` 針對缺少 cookie、格式錯誤、無效 session 明確回傳 `401`，並使用固定 `errorKey`（如 `authRefresh.missingRefreshToken`、`authRefresh.invalidRefreshTokenCookie`、`authRefresh.invalidSession`）。

---

**發現 2 — Refresh Token 可重放 (Replay) 風險**

* **現代化前：** 遺留模式未強制一次性消耗 refresh session，舊 token 可能被重複利用。
* **現代化後：** 使用一次性消耗策略（`findOneAndDelete`）原子移除 refresh session，重放請求會被拒絕並回傳 `401`。

---

**發現 3 — NGO Session 在刷新後可能降級或遺失關鍵 Claims**

* **現代化前：** refresh 後若未重建 NGO context，可能導致 `ngoId` / `ngoName` 遺失，造成授權語意偏差。
* **現代化後：** refresh 明確保留 NGO claims，避免 NGO session 於續期後被降級為一般 user token。

---

**發現 4 — NGO 核准狀態變更後仍可刷新 Session**

* **現代化前：** 缺乏刷新時的 NGO 狀態檢查，可能在資格撤銷後仍持續換發 access token。
* **現代化後：** refresh 時強制檢查 NGO 狀態（如 `isActive` / `isVerified`），不符合即回傳 `403`（`authRefresh.ngoApprovalRequired`）。

---

#### 高嚴重性 (High Severity 5–7)

**發現 5 — Refresh 流程缺乏速率限制**

* **現代化前：** 遺留實作缺少針對 refresh 端點的流量限制，易遭受自動化重試攻擊。
* **現代化後：** 套用 MongoDB-backed rate limiting，超限回傳 `429 others.rateLimited`。

---

**發現 6 — Cookie 安全屬性不足導致 Session 竊取風險升高**

* **現代化前：** refresh cookie 的安全屬性與作用範圍不夠嚴格，增加跨站或非預期路徑暴露面。
* **現代化後：** refresh cookie 強制 `HttpOnly`、`Secure`、`SameSite=Strict`，並採 stage-scoped path 限縮可用範圍。

---

**發現 7 — JWT 驗證分支覆蓋不足，易出現保護面遺漏**

* **現代化前：** 對 malformed header、expired token、錯誤 secret、`alg:none` 等分支缺乏一致行為。
* **現代化後：** `authJWT` 明確覆蓋上述分支並統一拒絕未授權請求；演算法固定為 `HS256`。

---

#### 中等嚴重性 (Medium Severity 8–9)

**發現 8 — 錯誤回應格式不一致，影響前端與監控追蹤**

* **現代化前：** 不同錯誤情境的 response shape 不穩定，前端難以穩定處理。
* **現代化後：** 統一輸出 `success: false`、`errorKey`、`error`、`requestId`，便於客戶端分流與 CloudWatch 追蹤。

---

**發現 9 — CORS 預檢邏輯不清晰造成跨來源暴露風險**

* **現代化前：** 對非允許來源與 OPTIONS 行為的處理缺乏明確邊界。
* **現代化後：** OPTIONS 明確回應 204，未知來源預檢拒絕（403），降低不當跨域調用風險。

---

#### 架構風險 (Structural Risk 10)

**發現 10 — Handler 生命週期順序不固定，易導致旁路**

* **現代化前：** 驗證、Guard、DB 與 Router 執行順序不一致時，可能出現未預期分支。
* **現代化後：** 採固定流程 `OPTIONS -> authJWT -> guard -> DB -> router -> service`，降低授權旁路與回歸風險。
