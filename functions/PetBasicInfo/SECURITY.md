# 舊版安全性審計 — 13 項現代化前後對照表

本文件根據 `functions/PetBasicInfo` 的 git 歷史舊版 `index.js`、目前重構後實作，以及 `dev_docs/TEST_REPORT.md` 撰寫。

基準與標準：`functions/UserRoutes` 現代化後的安全基線，以及 `dev_docs/REFACTOR_CHECKLIST.md` 規定的 request lifecycle、auth、guard、router、service 與 response 標準。

目前測試基線：`PetBasicInfo` 最新本地整合測試為 **36 passed，1 skipped（可達 37）**，已覆蓋 JWT 驗證、ownership、uniform 404、DELETE rate limit、CORS allowlist、欄位更新封鎖與 405 路由凍結等核心安全面向。

---

## 關鍵風險 (Critical 1–5)

### 發現 1 — Handler 內 JWT 驗證被整段註解，所有路由實際上可未授權存取

* **現代化前：** 舊版 `index.js` 雖然有載入 `authJWT`，但在 `/basic-info` 分支中整段驗證邏輯被註解掉，導致 `GET /pets/{petID}/basic-info`、`PUT /pets/{petID}/basic-info`、`GET /pets/{petID}/eyeLog`、`DELETE /pets/{petID}` 都不會在 Handler 內執行 JWT 驗證。
* **現代化後：** 所有路由都先經過 `authJWT`，`PUBLIC_RESOURCES` 明確為空陣列，只有 `OPTIONS` 會跳過驗證。測試已證實：缺少 Authorization、過期 Token、垃圾 Token、缺少 `Bearer` 前綴、簽名遭竄改與 `alg:none` 攻擊都會回傳 `401`。

---

### 發現 2 — 完全缺乏寵物所有權 / NGO 存取控制，知道 petID 即可讀寫他人資料

* **現代化前：** 舊版只依據路徑中的 `petID` 讀取寵物文件，沒有任何 `userId` 或 `ngoId` 對照檢查。攻擊者只要知道有效的 `petID`，即可讀取、更新甚至刪除不屬於自己的寵物。
* **現代化後：** `selfAccess.loadAuthorizedPet()` 會在服務層統一檢查 `event.userId === pet.userId` 或 `event.ngoId === pet.ngoId`。測試已驗證 stranger token 對 `GET`、`PUT`、`DELETE` 皆回傳 `403`。

---

### 發現 3 — DELETE /pets/{petID} 允許未經授權軟刪除任意寵物

* **現代化前：** 舊版刪除分支沒有 JWT 驗證，也沒有 ownership 檢查，只要傳入有效的 `petID` 即可直接將 `deleted: true`、`tagId: null` 寫回資料庫。
* **現代化後：** 刪除流程改為 `authJWT` → `enforceRateLimit` → `loadAuthorizedPet` → soft-delete。未登入請求回 `401`，非擁有者回 `403`，只允許寵物擁有者或對應 NGO 執行刪除。

---

### 發現 4 — PUT /pets/{petID}/basic-info 允許修改治理欄位與所有權相關欄位

* **現代化前：** 舊版更新邏輯直接從 body 讀取並寫入 `owner`、`ngoId`、`tagId`、`ngoPetId` 等欄位，等同允許呼叫者重新指派寵物歸屬、改寫治理識別碼或污染營運資料。
* **現代化後：** `petBasicInfoUpdateSchema` 以 allowlist 僅接受可編輯欄位，`owner`、`ngoId`、`tagId`、`ngoPetId` 皆被拒絕。測試已驗證傳入未知欄位或 `tagId` 會回傳 `400 petBasicInfo.errors.invalidUpdateField`。

---

### 發現 5 — GET /pets/{petID}/eyeLog 可被任意讀取，且直接回傳原始分析紀錄

* **現代化前：** 舊版 eyeLog 分支沒有身份驗證與 ownership 檢查，並直接回傳 `EyeAnalysis.find({ petId })` 的原始結果，沒有欄位投影或清理邊界，內部分析欄位可能隨 schema 演進被一起暴露。
* **現代化後：** `GET /pets/{petID}/eyeLog` 先走 `authJWT` 與 `loadAuthorizedPet()`，再以 `.select()` 搭配 `sanitizeEyeLog()` 僅回傳 API 允許欄位，且限制最多 100 筆。測試報告已將 eyeLog 欄位級清理列為已驗證項目。

---

## 高嚴重性 (High Severity 6–9)

### 發現 6 — 以 `410 petDeleted` 區分已刪除與不存在寵物，造成刪除狀態枚舉

* **現代化前：** 舊版在查到寵物後，若 `pet.deleted === true` 會回傳 `410 petDeleted`；若根本不存在則回傳 `404 petNotFound`。呼叫者可藉此判斷某個 `petID` 是否曾存在且已被刪除。
* **現代化後：** `loadAuthorizedPet()` 對「不存在」與「已軟刪除」一律回傳 `404 petBasicInfo.errors.petNotFound`。測試已驗證刪除後再次 GET 仍只會得到統一的 `404`。

---

### 發現 7 — DELETE 缺乏速率限制，可被用於暴力連打與 petID 探測

* **現代化前：** 舊版刪除路徑完全沒有 rate limiting。攻擊者可對大量 `petID` 持續送出刪除請求，放大資料探測與破壞性操作風險。
* **現代化後：** `deletePetBasicInfo()` 在任何寵物查詢前先執行 `enforceRateLimit({ action: "petDelete", limit: 10, windowSec: 60 })`。測試已驗證超過門檻後會回傳 `429 others.rateLimited`。

---

### 發現 8 — CORS 行為不一致，部分成功回應直接使用 `Access-Control-Allow-Origin: *`

* **現代化前：** 舊版 `GET /pets/{petID}/eyeLog` 與 `DELETE /pets/{petID}` 成功回應直接寫死 `Access-Control-Allow-Origin: *`，且 Handler 內未實際處理 `OPTIONS` preflight，導致部分敏感回應不受 allowlist 控制。
* **現代化後：** CORS 由 `src/cors.js` 統一處理，`OPTIONS` 會對允許來源回 `204`、對不允許或缺少 `Origin` 的請求回 `403`，所有成功與錯誤回應都透過 `corsHeaders(event)` 套用 allowlist。測試已驗證 allowed origin、disallowed origin、missing origin 三種 preflight 行為。

---

### 發現 9 — 原始驗證與 CastError 訊息直接回傳給客戶端

* **現代化前：** 舊版在更新與外層 catch 分支中，會將 Mongoose `ValidationError` 與 `CastError` 的細節字串串接進回應內容，導致內部 schema、欄位型別與例外訊息外洩。
* **現代化後：** 服務層 catch 統一記錄 `logError`，對外只回傳 `createErrorResponse(..., "others.internalError", event)`；輸入錯誤則由 guard 或 Zod 在前面明確回 `400`。測試報告亦確認錯誤響應採固定結構，不再回傳原始 exception message。

---

## 中等嚴重性 (Medium Severity 10–11)

### 發現 10 — 錯誤回應缺乏 `errorKey` 與 `requestId`，安全事件難以追蹤與關聯

* **現代化前：** 舊版 `createErrorResponse()` 只回傳 `success: false` 與翻譯後的 `error` 字串，前端與後端無法用穩定的機器可讀鍵值與 AWS request id 做事件關聯。
* **現代化後：** 所有錯誤回應統一包含 `success: false`、`errorKey`、`error`、`requestId`。測試已驗證 401 錯誤也會包含完整欄位，便於 CloudWatch 與前端錯誤追查。

---

### 發現 11 — 欄位過濾散落於 Handler 內，缺乏集中 sanitize 邊界

* **現代化前：** 舊版 `GET /basic-info` 以 handler 內手動組出 `form`，`GET /eyeLog` 則直接回傳原始文件。這種做法沒有統一的輸出邊界，日後 schema 增欄時很容易在不同分支出現欄位外洩落差。
* **現代化後：** 重構版將輸出清理集中至 `sanitizePet()` 與 `sanitizeEyeLog()`，並在服務層回應前統一套用。測試已驗證 `deleted`、`__v` 等內部欄位不會出現在 `GET /basic-info` 響應中。

---

## 架構風險 (Structural Risk 12–13)

### 發現 12 — 使用 `includes()` 進行模糊路由判斷，存在路由衝突與誤分支風險

* **現代化前：** 舊版以 `event.resource?.includes("/basic-info")`、`includes("/eyeLog")` 判斷路由；凡是不符合這兩類的請求，都會落入 delete 分支處理。這類模糊比對容易在新增相似路徑時誤判到錯誤邏輯。
* **現代化後：** `src/router.js` 改用精確的 `${event.httpMethod} ${event.resource}` 鍵值映射，未知路由一致回 `405`。測試已驗證 `POST /pets/{petID}/basic-info` 會被明確凍結為 `405 methodNotAllowed`。

---

### 發現 13 — 單體 `index.js` 耦合 DB、驗證、授權、路由與業務邏輯，安全修補易產生回歸

* **現代化前：** 舊版單一 `index.js` 同時負責 DB 連線、翻譯、JSON parse、pet 查詢、權限判斷、欄位驗證、更新與刪除處理。任何安全修補都必須在同一個大檔案內穿梭，極易造成控制流程遺漏，例如 JWT 驗證被註解後卻未被其他層補上。
* **現代化後：** 目前流程已拆為 `handler -> cors -> authJWT -> guard -> db -> router -> services -> sanitize/response`，每一層責任單一，並由整合測試覆蓋關鍵安全行為。這使後續維護時更容易驗證「授權是否先於業務邏輯」這類核心不變量。

---

## 總結

相較於舊版，PetBasicInfo 現代化後已實際補上以下安全控制：

* 強制 JWT 驗證與 HS256 演算法鎖定
* owner / NGO ownership 存取控制
* DELETE 速率限制
* allowlist 型更新 schema，封鎖治理欄位寫入
* 統一 404，避免軟刪除狀態枚舉
* eyeLog 與 basic-info 的集中輸出清理
* 精確路由分發與 405 凍結
* 統一錯誤回應結構與 requestId 追蹤
* allowlist 型 CORS 與正確 preflight 處理

就 `PetBasicInfo` 這個 Lambda 自身負責的攻擊面來看，目前已達到 `UserRoutes` 現代化後的同級基線：驗證先於受保護邏輯、ownership 在服務前被強制、輸出有 sanitize 邊界、錯誤有統一格式與追蹤能力、路由分發不再依賴模糊字串比對。
