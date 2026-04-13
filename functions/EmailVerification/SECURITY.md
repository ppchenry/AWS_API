# 舊版安全性審計 — 10 項現代化前後對照表

## 關鍵風險 (Critical 1–5)

### 發現 1 — `/account/generate-email-code-2` 直接造成帳號列舉

* **現代化前：** 舊版在 `generate-email-code-2` 分支中，若 Email 已存在則回傳 `201` 與 `newUser: false`；若 Email 不存在則直接回傳 `201`、`message: "User does not exist, Register first"` 與 `newUser: true`。任何人都可以透過公開接口探測指定 Email 是否已註冊。
* **現代化後：** `/account/generate-email-code-2` 已凍結為 `405 methodNotAllowed`。正式公開流量僅保留 `/account/generate-email-code`，且對存在與不存在的 Email 一律回傳統一成功響應，不再洩漏帳號存在狀態。

---

### 發現 2 — `/account/generate-email-code` 允許未驗證前建立 Placeholder User

* **現代化前：** 舊版 `generate-email-code` 在找不到用戶時，會直接建立新的 `User` 文件，寫入 `email`、`verified: false`、`newUser: true`、預設 credit 與 `passwordReset.resetCode`，然後回傳 `uid`。這代表未經驗證的公開請求即可替任意 Email 建立帳號殼層。
* **現代化後：** `generateEmailCode` 完全不觸碰 `users` collection，只寫入獨立的 `EmailVerificationCode` 驗證狀態。只有在 `/account/verify-email-code` 成功證明 Email 擁有權之後，系統才會建立真正的 User 記錄。

---

### 發現 3 — 驗證碼以明文形式寫入 User.passwordReset

* **現代化前：** 舊版將 6 位數驗證碼原樣寫入 `User.passwordReset.resetCode`，並用 `resetCodeExpiry` 存在同一份 User 文件上。任何能讀取該欄位的內部路徑、日誌或誤配置查詢，都可能直接暴露可用驗證碼。
* **現代化後：** 驗證碼改為以 SHA-256 雜湊值存入獨立的 `EmailVerificationCode` collection。`User` 文件不再承載暫時性驗證碼狀態，降低了敏感資料暴露面與資料模型耦合。

---

### 發現 4 — 驗證成功後未消耗驗證碼，存在 Replay 風險

* **現代化前：** 舊版 `/account/verify-email-code` 只比對 `passwordReset.resetCode` 與到期時間，成功後直接發放 JWT 與 Refresh Token，沒有刪除、清空或標記該驗證碼為已使用。只要驗證碼仍在時效內，同一組 Code 就可能被重複使用。
* **現代化後：** 驗證改為對 `EmailVerificationCode` 做原子性 `findOneAndUpdate`，條件必須同時滿足 `_id=email`、`codeHash` 正確、`consumedAt: null` 與 `expiresAt > now`，成功後立即設置 `consumedAt`。同一組驗證碼只能成功一次。

---

### 發現 5 — 驗證失敗分支可區分「無碼」與「過期」狀態，洩漏驗證狀態資訊

* **現代化前：** 舊版 `/account/verify-email-code` 會對不同失敗情境回傳不同錯誤，例如 `noCodeFound` 與 `codeExpired`，甚至使用 `410` 來表示過期。這使攻擊者能區分目標 Email 是否有待驗證狀態、驗證碼是否已產生，以及是否已過期。
* **現代化後：** 除了純輸入格式錯誤外，所有驗證失敗情形（不存在、錯碼、過期、已消耗、已刪除帳號）統一回傳 `400 verificationFailed`，避免透過回應差異進行列舉或狀態探測。

---

## 高嚴重性 (High Severity 6–8)

### 發現 6 — 公開驗證流程完全沒有 Rate Limiting

* **現代化前：** 舊版 `generate-email-code`、`generate-email-code-2` 與 `verify-email-code` 都沒有速率限制。攻擊者可以持續打 Email 發送接口或暴力猜測 6 位數驗證碼。
* **現代化後：** `generateEmailCode` 與 `verifyEmailCode` 均接入 `enforceRateLimit`。現在以 `IP + email` 為複合鍵，在 300 秒窗口內分別限制 Generate 5 次、Verify 10 次，超過即回傳 `429 others.rateLimited`。

---

### 發現 7 — Refresh Cookie 過度寬鬆且路徑錯誤

* **現代化前：** 舊版驗證成功後回傳的 `Set-Cookie` 使用 `SameSite=None; Path=/`，且字串尾端還帶有多餘 `}`。Cookie 作用域過大，不符合 repo 內 `/auth/refresh` 的實際消費路徑，也提高跨站濫用與 session 管理混亂的風險。
* **現代化後：** Refresh Cookie 由 `buildRefreshCookie()` 統一產生，固定使用 `HttpOnly; Secure; SameSite=Strict`，並將 `Path` 明確收斂到 `/{stage}/auth/refresh` 或 `/auth/refresh`，與 `AuthRoute` / `UserRoutes` 基準一致。

---

### 發現 8 — SMTP 失敗時直接回傳內部錯誤細節

* **現代化前：** 舊版在 `transporter.verify()` 失敗時，會把 `err.message` 直接放進 `details` 回傳給客戶端，例如 SMTP 驗證失敗原因、主機問題或認證訊息。這屬於明顯的內部系統資訊外洩。
* **現代化後：** SMTP 問題統一回傳 `503 emailServiceUnavailable`。詳細錯誤只記錄在結構化日誌中，不再對外暴露內部郵件基礎設施細節。

---

## 中等嚴重性 (Medium Severity 9)

### 發現 9 — 錯誤響應格式不一致，缺乏 `errorKey` 與 `requestId`

* **現代化前：** 舊版 `createErrorResponse` 只回傳 `success: false` 與翻譯後的 `error` 字串；部分分支甚至直接手組 `{ message, newUser }` 等任意物件。這讓前端、測試與稽核工具難以穩定辨識失敗原因，也不利於 CloudWatch 對單追查。
* **現代化後：** 全部錯誤統一經由 `utils/response.js` 產生，固定包含 `success: false`、機器可讀的 `errorKey`、翻譯後的 `error` 與 `requestId`，與 `UserRoutes` 基準對齊。

---

## 架構風險 (Structural Risk 10)

### 發現 10 — 單體 Handler 以 `includes()` 模糊匹配路由，且混入歷史別名

* **現代化前：** 舊版在單一 `index.js` 中用 `event.resource?.includes("/generate-email-code")`、`includes("/generate-email-code-2")`、甚至 `includes("/register-email-app")` 來判定分支。這種模糊比對容易因路由名稱相似、歷史別名殘留或未來新增路徑而誤入錯誤邏輯。
* **現代化後：** 路由分發移至 `src/router.js`，以精確的 `HTTP method + event.resource` 鍵值匹配，並將 `/account/generate-email-code-2` 明確凍結為 `405`。公開路徑白名單也集中在 `handler.js` 的 `PUBLIC_RESOURCES` 中，避免歷史路由殘留造成安全漂移。

---

## 總結

EmailVerification 的現代化重點，不只是把單檔案拆成 `handler`、`router`、`services` 而已，而是實際修補了公開驗證流程中最危險的幾個問題：

* 帳號列舉
* 未驗證前建立 User
* 明文驗證碼存放
* 驗證碼可重放
* 驗證狀態差異洩漏
* 缺乏速率限制
* Refresh Cookie 範圍錯誤
* 內部 SMTP 錯誤外洩
* 錯誤響應格式不穩定
* 單體 Handler 的模糊路由分支

現代化後，這個 Lambda 已與 `UserRoutes` / `PetBasicInfo` 的基準靠攏：

* 精確路由匹配
* fail-fast env 驗證
* guard 層 JSON 與空主體驗證
* DB 連線重用
* 統一錯誤結構
* 公開驗證流程的 anti-enumeration
* 驗證碼雜湊與原子消耗
* 正確的 refresh cookie contract
* 可執行的整合測試與已驗證的部署後實機測試
