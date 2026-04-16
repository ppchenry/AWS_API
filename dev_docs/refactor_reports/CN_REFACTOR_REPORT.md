# Monorepo 重構進度報告（2026-04-16）

## 概述 (Overview)

在目前這一階段的 Monorepo 現代化工程中，已完成 6 個 Lambda 函式的原位 (in-place) 重構：

* `functions/UserRoutes`
* `functions/PetBasicInfo`
* `functions/EmailVerification`
* `functions/AuthRoute`
* `functions/GetAllPets`
* `functions/PetLostandFound`

此項工作隸屬於 [README.md](README.md) 中定義的 Monorepo 清理計畫，嚴格遵循 [dev\_docs/REFACTOR\_CHECKLIST.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/REFACTOR_CHECKLIST.md) 的現代化基準，並依據 [dev\_docs/LAMBDA\_REFACTOR\_INVENTORY.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/LAMBDA_REFACTOR_INVENTORY.md) 的優先順序執行。

**目前已驗證的成果：**

* `UserRoutes`：**106 / 106 項整合測試通過**，另有 **6 / 6 項 SMS service 單元測試通過**
* `PetBasicInfo`：**36 項通過 / 1 項因測試資料 (fixture) 跳過 / 共 37 項可達路徑**
* `EmailVerification`：**30 / 30 項測試通過**
* `AuthRoute`：**22 / 22 項測試通過**
* `GetAllPets`：**49 項通過 / 2 項因環境限制跳過 / 共 51 項可達路徑**
* `PetLostandFound`：**59 / 59 項整合測試通過**
* **綜合總計：302 項通過 + 3 項選配或環境限制測試跳過**

另外，`EmailVerification` 已完成部署後的實機驗證：

* `POST /account/generate-email-code` 已在 Dev API Gateway 成功觸發並送達真實驗證郵件
* `POST /account/verify-email-code` 已在 Dev API Gateway 成功回傳 JWT 與 refresh cookie 合約欄位

這代表重構工作已在不變動前端合約 (Contract) 的前提下，於安全性、正確性、可維護性及運行行為方面產生了可衡量的進步。

其中一個最重要的架構成果，是核心帳戶驗證循環現在已被拆分成 3 個更清晰的 Lambda 職責：

* `UserRoutes`：負責主要登入入口、register-first 帳戶建立、SMS 驗證登入、NGO auth 與受保護的帳戶操作
* `EmailVerification`：負責公開的 Email 身分證明流程，並可為已註冊使用者建立已驗證 session
* `AuthRoute`：負責 refresh token 輪替與短效 access token 更新

此外，`PetLostandFound` 是首個非 auth 類別、以寵物領域為核心的大型 Lambda 完成全面模組化拆分（原始 1089 行單體拆分為 20+ 模組），並在測試過程中發現並修復了 `mime` v4 ESM-only 相容性問題。

**核心進展：安全性加固**
這一階段的工作並非單純的程式碼整潔化。我們直接降低了五個高價值 Lambda 介面的受攻擊風險。這不是「可有可無」的清理，而是移除可能導致未經授權的數據訪問、帳戶/寵物刪除、帳號奪取、敏感數據外洩、暴力破解及授權繞過的弱點。在初創環境中，這些不僅是技術問題，更是重大的**商業風險**。

-----

## 截至 2026-04-16 的 Monorepo 現況 (Status)

專案初期處於遺留 (Legacy) 狀態，Lambda 之間存在大量重複代碼，且業務邏輯與路由邏輯混雜。目前的策略是**受控的原位現代化 (In-situ Modernization)**，逐一穩定每個 Lambda。

**目前進度：**

* 6 個模組化的參考基準 Lambda
* 一套完整的現代化執行標準
* 基於程式碼行數與風險的 Lambda 盤點清單
* 基於整合測試 (Integration Test) 的驗證機制
* 可重複運用的重構模式（適用於剩餘 Lambda）

目前 **25 個**工作區中的 Lambda 裡，已有 **6 個**完成加固，約為 **24%**。這意味著雖然我們已證明加固方案的可行性，但整個 Monorepo 仍處於現代化曲線的早期階段，剩餘部分仍存有潛在風險。

-----

## 重構後的 Auth Flow

目前帳戶 session 生命週期已被拆分到 3 個 Lambda，責任邊界比舊系統清楚得多，也減少了隱性副作用。

### 1. `UserRoutes` 負責註冊、主要登入，以及 SMS 建立 Session

`UserRoutes` 現在是主要的帳戶入口 Lambda。它處理一般註冊、NGO 註冊、email/password login、SMS verification login，以及已登入後的帳戶操作。

這次最重要的改動之一，是把一般使用者的註冊與 session 發放正式拆開。

對一般使用者來說：

* `POST /account/register` 現在只負責建立帳號
* 註冊可以先建立 pending identity，但不直接發 token
* session 會在後續的 `POST /account/login`、`POST /account/verify-sms-code` 或 `POST /account/verify-email-code` 成功後才建立

對 NGO 來說：

* `POST /account/register-ngo` 會建立 NGO 使用者上下文，並立即發出 NGO session
* 後續 NGO login 會先檢查目前的 NGO approval 狀態，才決定是否發出 session

只要是由 `UserRoutes` 成功建立 session，目前合約已經趨於一致：

* 一個短效 Bearer JWT access token
* 一個以 `HttpOnly` cookie 保存的 refresh token

### 2. `EmailVerification` 負責 Email 身分證明，不再負責建立帳號

`EmailVerification` 現在專注於公開的 email code 產生，以及註冊之後的 email 驗證。

相較於舊流程，它的責任更窄，也更安全：

* generate 保持公開，並具備 anti-enumeration 保護
* verify 會以原子方式消耗驗證碼，避免 replay
* verify 不會建立新的 user account
* verify 只有在對應帳號已存在且未被刪除時才會成功
* 驗證成功後，會把該帳號標記為 verified，並發出與主要 login flow 相同的 session 材料

這代表 `EmailVerification` 已不再是帳號建立機制，而是註冊後的 email proof 流程。只有既有 user record 存在時，它才會 bootstrap 一個 session。

### 3. `AuthRoute` 負責 Refresh Rotation 與 Renewal Policy

`AuthRoute` 現在是專門處理 refresh token 的 Lambda。它的公開路由 `/auth/refresh` 不是靠 Bearer token，而是靠 refresh-token cookie 驗證。

在 refresh 流程中，它現在會執行更嚴格的 renewal 步驟：

* 從 cookie 讀取 refresh token
* 將 token hash 後，消耗對應的 refresh-token 記錄
* 拒絕 missing、malformed、expired 或 replayed refresh token
* 發出新的短效 access token
* 輪替 refresh cookie，重新簽發新的 refresh token

對 NGO 使用者來說，refresh 還會同時保留 session context 並執行目前的策略檢查：

* 新 access token 會保留 `ngoId`、`ngoName` 等 NGO claims
* 若 NGO 已經不再 approved 或 active，refresh 會被拒絕

### 4. 端到端 Session Model

目前加固後的 session lifecycle 可以整理成：

1. 使用者先透過明確的 bootstrap path 建立身分：一般 login、SMS verification、email verification，或 NGO register / login。
2. 只要 bootstrap path 成功，就會回傳短效 access token 與 `HttpOnly` refresh-token cookie。
3. 後續受保護路由再透過 JWT middleware 驗證 access token。
4. 當 access token 過期時，client 呼叫 `AuthRoute` 進行 refresh rotation，取得新的 access token。

相較於舊有遺留狀態，這是實質改善，因為 registration、verification、login 與 refresh 現在都被拆成獨立責任，token 語意更一致，而且具備測試支撐，能作為一個完整的 auth system 被審計與維護。

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
* **`AuthRoute`**：完成 refresh session 流程的生命週期重構，並以 **22 / 22** 測試覆蓋 handler、authJWT、NGO claim preservation、NGO approval denial 與 refresh rotation/replay rejection。
* **`GetAllPets`**：完成寵物讀寫與權限控制流程的重構，並以 **49 項通過 / 2 項環境限制跳過** 的整合測試覆蓋公開 NGO 查詢、JWT 驗證、自身存取、ownership enforcement、delete 與 update 路徑。
* **`PetLostandFound`**：完成 1089 行單體的全面拆分（20+ 模組），4 輪審計修復 15 項發現，並以 **59 / 59** 整合測試覆蓋 pet-lost/pet-found CRUD、notifications CRUD、CORS、auth、guard、rate limiting 與 response shape。測試過程中發現並修復 `mime` v4 ESM-only 相容性問題。
* **評估**：這些已完成 Lambda 的已知核心攻擊面約有 **75% 至 85%** 得到實質強化。

### 2\. 整體 Monorepo 的覆蓋程度

* 目前 **6 / 25** 已完成。
* 約 **24%** 的 Lambda 隊列已達新標準，**76%** 仍需進行相同的審查與重構。

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

截至 2026-04-16，Monorepo 重構工作已產出 6 個可作為基準的參考實作，並累積 **302 項通過測試 + 3 項選配或環境限制測試跳過**。這份報告應被視為某一日期節點的進度快照，而不是以「第幾天」為主的階段命名。

目前這一階段的努力不僅產出了 6 個強大的參考實現，更透過 **302 項通過測試**，證明了這套模式的可行性。這不是單純的「美容工程」，而是具備高度複利效應的工程實踐。在初創企業中，這種能平衡業務交付與風險控制的工作，應被視為保護公司資產的核心貢獻。
