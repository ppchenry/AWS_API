# Monorepo 重構進度報告（2026-04-14）

## 概述 (Overview)

在目前這一階段的 Monorepo 現代化工程中，已完成 5 個 Lambda 函式的原位 (in-place) 重構：

* `functions/UserRoutes`
* `functions/PetBasicInfo`
* `functions/EmailVerification`
* `functions/AuthRoute`
* `functions/GetAllPets`

此項工作隸屬於 [README.md](README.md) 中定義的 Monorepo 清理計畫，嚴格遵循 [dev\_docs/REFACTOR\_CHECKLIST.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/REFACTOR_CHECKLIST.md) 的現代化基準，並依據 [dev\_docs/LAMBDA\_REFACTOR\_INVENTORY.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/LAMBDA_REFACTOR_INVENTORY.md) 的優先順序執行。

**目前已驗證的成果：**

* `UserRoutes`：**102 / 102 項測試通過**
* `PetBasicInfo`：**36 項通過 / 1 項因測試資料 (fixture) 跳過 / 共 37 項可達路徑**
* `EmailVerification`：**30 / 30 項測試通過**
* `AuthRoute`：**21 / 21 項測試通過**
* `GetAllPets`：**49 項通過 / 2 項因環境限制跳過 / 共 51 項可達路徑**
* **綜合總計：238 項通過 + 3 項選配或環境限制測試跳過**

另外，`EmailVerification` 已完成部署後的實機驗證：

* `POST /account/generate-email-code` 已在 Dev API Gateway 成功觸發並送達真實驗證郵件
* `POST /account/verify-email-code` 已在 Dev API Gateway 成功回傳 JWT 與 refresh cookie 合約欄位

這代表重構工作已在不變動前端合約 (Contract) 的前提下，於安全性、正確性、可維護性及運行行為方面產生了可衡量的進步。

其中一個最重要的架構成果，是核心帳戶驗證循環現在已被拆分成 3 個更清晰的 Lambda 職責：

* `UserRoutes`：負責主要登入入口與受保護的帳戶操作
* `EmailVerification`：負責公開的 Email 身分證明流程，並可建立已驗證使用者的初始 session
* `AuthRoute`：負責 refresh token 輪替與短效 access token 更新

**核心進展：安全性加固**
這一階段的工作並非單純的程式碼整潔化。我們直接降低了五個高價值 Lambda 介面的受攻擊風險。這不是「可有可無」的清理，而是移除可能導致未經授權的數據訪問、帳戶/寵物刪除、帳號奪取、敏感數據外洩、暴力破解及授權繞過的弱點。在初創環境中，這些不僅是技術問題，更是重大的**商業風險**。

-----

## 截至 2026-04-14 的 Monorepo 現況 (Status)

專案初期處於遺留 (Legacy) 狀態，Lambda 之間存在大量重複代碼，且業務邏輯與路由邏輯混雜。目前的策略是**受控的原位現代化 (In-situ Modernization)**，逐一穩定每個 Lambda。

**目前進度：**

* 5 個模組化的參考基準 Lambda
* 一套完整的現代化執行標準
* 基於程式碼行數與風險的 Lambda 盤點清單
* 基於整合測試 (Integration Test) 的驗證機制
* 可重複運用的重構模式（適用於剩餘 Lambda）

目前 **25 個**工作區中的 Lambda 裡，已有 **5 個**完成加固，約為 **20%**。這意味著雖然我們已證明加固方案的可行性，但整個 Monorepo 仍處於現代化曲線的早期階段，剩餘部分仍存有潛在風險。

-----

## 重構後的 Auth Flow

目前的帳戶 session 生命週期已被拆分到 3 個 Lambda，且責任邊界更清晰。

### 1. `UserRoutes` 負責初始登入與受保護帳戶操作

`UserRoutes` 是主要的帳戶入口 Lambda，處理 email login、SMS login、registration 以及已登入後的帳戶操作。公開路由會被明確 allowlist；其餘受保護路由則先通過 JWT 驗證，才會進入業務邏輯。

當主要登入流程成功時，`UserRoutes` 會發出：

* 一個短效 Bearer JWT access token
* 一個以 `HttpOnly` cookie 保存的 refresh token

### 2. `EmailVerification` 在 Email 身分證明後建立 Session

`EmailVerification` 處理公開的 email code 產生與 email code 驗證。它位於 auth funnel 更前段：先證明 email 擁有權，之後才查找或建立對應的 user。

當驗證碼驗證成功時，`EmailVerification` 會：

* 以原子方式消耗驗證碼，避免 replay
* 避免在證明擁有權之前建立 placeholder user
* 發出與主要登入流程相同的驗證材料：短效 JWT 與 refresh-token cookie

這使 `EmailVerification` 不再只是工具型端點，而是另一條可建立登入狀態的 session bootstrap 路徑。

### 3. `AuthRoute` 負責 Session Renewal

`AuthRoute` 現在是專職的 refresh-token Lambda。它目前唯一的公開路由是 `/auth/refresh`，之所以設計成 public route，是因為它透過 refresh-token cookie 驗證，而不是透過 Bearer token。

在 refresh 流程中，`AuthRoute` 會：

* 從 cookie 讀取 refresh token
* 先將 token hash 後，消耗對應的儲存 refresh-token 記錄
* 拒絕 missing、invalid、expired 或 replayed refresh token
* 發出新的短效 access token
* 若刷新的是 NGO 使用者，保留 `ngoId` 與 `ngoName` 等 NGO session claims，避免 refresh 後 session 降級
* 同時輪替 refresh cookie，發出新的 refresh token

### 4. 端到端 Auth Cycle

目前加固後的 auth cycle 為：

1. 呼叫方先透過 `UserRoutes` 的 login，或 `EmailVerification` 的 email code verify 證明身分。
2. 驗證成功後，由對應 Lambda 發出短效 access token 與 `HttpOnly` refresh-token cookie。
3. 後續受保護路由透過 `authJWT` middleware 驗證 JWT。
4. 當 access token 過期時，client 呼叫 `AuthRoute`，輪替 refresh token 並取得新的 access token。

相較於舊有遺留狀態，這是實質改善，因為 login、verification 與 refresh 現在都已被明確拆分、具備測試支撐，也更容易作為單一 session lifecycle 進行審計。

-----

## 安全風險快照 (Security Risk Snapshot)

根據在 `UserRoutes`、`PetBasicInfo`、`EmailVerification` 的嚴格複審，以及 `AuthRoute` 對 refresh session 流程與 `GetAllPets` 對 pet 存取控制流程的專項加固中所確認的發現，未經重構的遺留 Lambda 可能面臨以下攻擊類別：

* **身分驗證破碎 (Broken Auth)**：受保護路由可在無有效 JWT 驗證下訪問。
* **越權攻擊 (IDOR)**：攻擊者可透過修改參數讀取或篡改他人數據。
* **未授權刪除**：任意帳號或寵物數據可能在無權限檢查下被刪除。
* **帳號奪取 (Account Takeover)**：不安全的註冊流程或棄用的驗證變體可能發放錯誤憑證。
* **列舉攻擊 (Enumeration)**：公開端點洩漏用戶或電話是否存在。
* **暴力破解與自動化濫用**：登入與簡訊接口缺乏頻率限制 (Rate Limiting)。
* **JWT 竄改**：簽名驗證薄弱導致的過期回放或算法繞過。
* **批量賦值 (Mass-assignment)**：調用者可寫入 `role`、`deleted` 等內部治理欄位。
* **敏感數據外洩**：資料庫原始文件洩漏密碼雜湊值 (Hash) 或內部標記。
* **NoSQL 注入/負載濫用**：邏輯誤收非預期的操作符物件。
* **路由混淆 (Route Confusion)**：模糊匹配導致請求進入錯誤的路徑。

-----

## 重構覆蓋率評估

### 1\. 已重構 Lambda 的加固程度

在已完成的參考 Lambda 中，安全性覆蓋率極高：

* **`UserRoutes`**：解決了 **19 項**遺留安全發現。
* **`PetBasicInfo`**：解決了 **13 項**涵蓋權限、刪除操作與路徑匹配的發現。
* **`EmailVerification`**：完成公開驗證流程的重構、嚴格複審、30/30 整合測試與部署後實機驗證。
* **`AuthRoute`**：完成 refresh session 流程的生命週期重構，並以 **21 / 21** 測試覆蓋 handler、authJWT、NGO claim preservation 與 refresh rotation/replay rejection。
* **`GetAllPets`**：完成寵物讀寫與權限控制流程的重構，並以 **49 項通過 / 2 項環境限制跳過** 的整合測試覆蓋公開 NGO 查詢、JWT 驗證、自身存取、ownership enforcement、delete 與 update 路徑。
* **評估**：這些已完成 Lambda 的已知核心攻擊面約有 **75% 至 85%** 得到實質強化。

### 2\. 整體 Monorepo 的覆蓋程度

* 目前 **5 / 25** 已完成。
* 約 **20%** 的 Lambda 隊列已達新標準，**80%** 仍需進行相同的審查與重構。

-----

## 核心改進項目

### 1\. 安全漏洞修補

關閉了記錄在各 Lambda `SECURITY.md` 中的具體風險。這雖然短期內比開發新功能慢，但能避免未來因安全事故導致的緊急修補與信譽損失。

### 2\. 性能優化 (Performance)

* **冷啟動優化**：縮減 `index.js` 入口體積。
* **延遲加載 (Lazy Loading)**：避免在每次調用時加載無關服務。
* **連線池管理**：複用 MongoDB 連線並優化連線池大小。
* **提早拒絕 (Fail-Fast)**：在進行資料庫操作前先驗證非法請求。

### 3\. 可維護性 (Maintainability)

建立了統一的生命週期：**處理程序編排 -\> CORS 預檢 -\> JWT 驗證 -\> Guard 校驗 -\> 資料庫啟動 -\> 精確路由派發 -\> 服務執行 -\> 統一響應構建**。這降低了工程師修改程式碼時造成迴歸錯誤 (Regression) 的風險。

### 4\. 擴展性與穩定性 (Scalability & Stability)

* 建立了可重複使用的 Lambda 模板。
* 結構化日誌輸出，方便生產環境排錯。
* 規範化的 HTTP 狀態碼使用 (400, 401, 403, 429 等)。
* 使用 SAM local 與 UAT MongoDB 進行集成測試驗證。

-----

## 為什麼選擇「原位現代化」而非「全面重構」？

目前的策略是在不進行大規模架構翻新 (DDD) 的情況下，逐一現代化 Lambda。這是最務實的做法，因為它能：

1. **降低風險**：逐一替換而非大爆炸式的全面更換。
2. **零停機**：不需要大規模遷移服務。
3. **前端相容**：不破壞現有的 API 合約。
4. **即時價值**：在不停止業務開發的前提下，持續降低 Live Risk。

這是連接「脆弱遺留代碼」與「未來領域驅動架構 (DDD)」之間的橋樑。

-----

## 結語

截至 2026-04-14，Monorepo 重構工作已產出 5 個可作為基準的參考實作，並累積 **238 項通過測試 + 3 項選配或環境限制測試跳過**。這份報告應被視為某一日期節點的進度快照，而不是以「第幾天」為主的階段命名。

目前這一階段的努力不僅產出了 5 個強大的參考實現，更透過 **238 項通過測試**，證明了這套模式的可行性。這不是單純的「美容工程」，而是具備高度複利效應的工程實踐。在初創企業中，這種能平衡業務交付與風險控制的工作，應被視為保護公司資產的核心貢獻。
