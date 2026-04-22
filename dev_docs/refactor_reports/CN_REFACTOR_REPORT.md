# Monorepo 重構進度報告（2026-04-22）

## 概述 (Overview)

在目前這一階段的 Monorepo 現代化工程中，已完成 17 個 Lambda 函式的原位 (in-place) 重構：

* `functions/UserRoutes`
* `functions/PetBasicInfo`
* `functions/EmailVerification`
* `functions/AuthRoute`
* `functions/GetAllPets`
* `functions/PetLostandFound`
* `functions/EyeUpload`
* `functions/PetDetailInfo`
* `functions/PetMedicalRecord`
* `functions/purchaseConfirmation`
* `functions/SFExpressRoutes`
* `functions/OrderVerification`
* `functions/PetBiometricRoutes`
* `functions/PetVaccineRecords`
* `functions/CreatePetBasicInfo`
* `functions/GetAdoption`
* `functions/PetInfoByPetNumber`

此項工作隸屬於 [README.md](README.md) 中定義的 Monorepo 清理計劃，遵循 [dev_docs/REFACTOR_CHECKLIST.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/REFACTOR_CHECKLIST.md) 的現代化基準，並依據 [dev_docs/LAMBDA_REFACTOR_INVENTORY.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/LAMBDA_REFACTOR_INVENTORY.md) 的優先順序執行。

目前依 `__tests__` 測試檔統計的測試案例數：

* `UserRoutes`：`__tests__/test-userroutes.test.js` 內 **93 項整合測試案例**，另有 `__tests__/test-sms-service.test.js` 內 **6 項 SMS service 單元測試案例**，以及 `__tests__/test-authworkflow.test.js` 內 **28 項 auth-workflow 單元測試案例**
* `PetBasicInfo`：`__tests__/test-petbasicinfo.test.js` 內 **37 項整合測試案例**
* `EmailVerification`：`__tests__/test-emailverification.test.js` 內 **30 項整合測試案例**
* `AuthRoute`：`__tests__/test-authroute.test.js` 內 **22 項測試案例**
* `GetAllPets`：`__tests__/test-getallpets.test.js` 內 **53 項整合測試案例**
* `PetLostandFound`：`__tests__/test-petlostandfound.test.js` 內 **59 項整合測試案例**
* `EyeUpload`：`__tests__/test-eyeupload.test.js` 內 **94 項整合測試案例**
* `PetDetailInfo`：`__tests__/test-petdetailinfo.test.js` 內 **82 項整合測試案例**
* `PetMedicalRecord`：`__tests__/test-petmedicalrecord.test.js` 內 **65 項整合測試案例**，另有 `__tests__/test-petmedicalrecord-bloodtest-aggregate.test.js` 內 **3 項 blood-test aggregate 單元測試**
* `purchaseConfirmation`：`__tests__/test-purchaseconfirmation.test.js` 內 **65 項整合測試案例**（63 項通過，2 項條件跳過）
* `SFExpressRoutes`：`__tests__/test-sfexpressroutes.test.js` 內 **31 項整合測試案例**（26 項通過，5 項條件跳過），另有 `__tests__/test-sfexpressroutes-unit.test.js` 內 **15 項單元測試案例**
* `OrderVerification`：`__tests__/test-orderverification.test.js` 內 **39 項整合測試案例**
* `PetBiometricRoutes`：`__tests__/test-petbiometricroutes.test.js` 內 **41 項整合測試案例**；最新 SAM-local 執行中有 **33 項實際執行並通過**，另有 **8 項** 因外部 business cluster 無法從目前機器連線而被環境條件式跳過
* `PetVaccineRecords`：`__tests__/test-petvaccinerecords.test.js` 內 **34 項 SAM 整合測試案例**，全部通過
* `CreatePetBasicInfo`：`__tests__/test-createpetbasicinfo-unit.test.js` 內 **18 項直接呼叫 handler 測試案例**（4 項 DB 條件式）
* `GetAdoption`：`__tests__/test-getadoption-unit.test.js` 內 **21 項純 unit 測試案例**（無 SAM，無實際 DB）
* `PetInfoByPetNumber`：`__tests__/test-petinfobypetnumber.test.js` 內 **13 項直接呼叫 handler 測試案例**（3 項 DB 條件式）
* 綜合總計：**17 個已重構 Lambda 共 797 項 integration-style 與 direct-handler 測試案例 + 15 項 SFExpressRoutes 單元測試案例 + 6 項 SMS service 單元測試案例 + 28 項 auth-workflow 單元測試案例 + 3 項 PetMedicalRecord aggregate 單元測試**

以上數字為測試檔中「宣告的案例數」，本身不等同於同日完整執行紀錄。已完成的個別測試結果請參考 `dev_docs/test_reports/` 內各 Lambda 的測試報告。

目前已知的實機驗證也包括 `EmailVerification` 的 Dev API Gateway 抽樣測試：

* `POST /account/generate-email-code` 已在 Dev API Gateway 成功觸發並送達真實驗證郵件
* `POST /account/verify-email-code` 已在 Dev API Gateway 成功回傳 JWT 與 refresh cookie 合約欄位

核心帳戶驗證循環目前已拆分成 3 個更清楚的 Lambda 職責：

* `UserRoutes` 負責 **verification-first 註冊**（一般使用者不使用密碼）、NGO auth 與受保護的帳戶操作。`POST /account/login`、`PUT /account/update-password`、`POST /account/login-2` 為凍結路由，回傳 `405`
* `EmailVerification` 負責公開的 Email 身分證明流程，使用 **3-branch verify**：(1) 已認證使用者 → 綁定 email 到帳號，(2) 新使用者 → `{ verified: true, isNewUser: true }`，(3) 已註冊使用者 → 自動登入並發行 token
* `AuthRoute` 負責 refresh token 輪替與短效 access token 更新

核心進展是安全性加固。這一階段的工作並非單純的程式碼整潔化，而是在 17 個已重構的高價值 Lambda 介面上，實質降低已知受攻擊風險。這些風險包含未經授權的資料存取、帳戶或寵物刪除、帳號奪取、敏感資料外洩、暴力破解、水平越權與授權繞過。

---

## 截至 2026-04-22 的 Monorepo 現況 (Status)

專案初期處於 legacy 狀態，Lambda 之間存在大量重複 helper、混合 routing 與 business logic 的單體檔案，以及難以安全演進的隱性合約。

目前策略不是立即進行全面 DDD 重寫，而是受控的原位現代化 (in-situ modernization)：逐一穩定每個 Lambda，保留現有 API 合約，同時提升安全性、可測試性與可維護性。

目前進度：

* 17 個模組化參考基準 Lambda
* 一套書面現代化標準
* 一份以行數與風險為基礎的 Lambda 盤點清單
* 已完成目標具備整合測試支撐
* 可重複套用到剩餘 Lambda 的重構模式

依據 `dev_docs/LAMBDA_REFACTOR_INVENTORY.md`，目前正式納入重構統計範圍的是 **22 個** Lambda。`adoption_website`、`AuthorizerRoute`、`TestIPLambda`、`WhatsappRoute` 目前列為 out-of-plan。

在此統計口徑下，已有 **17 / 22** 完成加固。剩餘 5 個（`AIChatBot`、`GetBreed`、`LambdaProxyRoute`、`PublicRoutes`、`CreateFeedback`）已由管理層標註為「不需要」，列為 out-of-scope。第一階段原位現代化計畫因此**正式完成**。

若以工作區全部 function folder 計算，目前共有 26 個 function folders；其中 4 個刻意排除於主要重構計劃之外，因此不應與主進度混算。

---

## 重構後的 Auth Flow

目前帳戶 session 生命週期已拆分到 3 個 Lambda，責任邊界比舊系統清楚，也減少隱性副作用。

### 1. `UserRoutes` 負責註冊與受保護帳戶操作

`UserRoutes` 現在是主要帳戶入口 Lambda。它處理 verification-first 註冊、NGO 註冊，以及已登入後的帳戶操作。

最重要的變更是 **verification-first flow**：一般使用者不再使用密碼。

對一般使用者來說：

* `POST /account/login` 為**凍結路由**，回傳 `405` — 一般使用者不透過帳密登入
* `PUT /account/update-password` 為**凍結路由**，回傳 `405` — 一般使用者沒有密碼
* `POST /account/login-2` 為**凍結路由**，回傳 `405`
* `POST /account/register` 要求在 10 分鐘窗口內提供已消耗的 email 或 SMS 驗證碼
* 註冊成功回傳 `{ userId, role, isVerified, token }` 與 `201` 狀態碼及 `HttpOnly` refresh cookie
* 一般使用者的完整驗證流程為：**verify email/SMS → 帶驗證證明註冊 → 獲得 session**

對 NGO 來說：

* `POST /account/register-ngo` 會建立 NGO 使用者上下文，並立即發出 NGO session（NGO 仍使用密碼）
* 後續 NGO login 會先檢查目前 NGO approval 狀態，才決定是否發出 session

由 `UserRoutes` 成功建立 session 時，目前合約趨於一致：

* 一個短效 Bearer JWT access token
* 一個以 `HttpOnly` cookie 保存的 refresh token

### 2. `EmailVerification` 負責 Email 身分證明（3-Branch Verify）

`EmailVerification` 現在專注於公開的 email code 產生與驗證。

其 verify endpoint 使用 **3-branch flow**：

* **Branch 1 — 已認證使用者**（帶 Bearer token）：將已驗證的 email 綁定到現有帳號
* **Branch 2 — 新使用者**（該 email 無對應帳號）：回傳 `{ verified: true, isNewUser: true }` 讓前端繼續到註冊流程
* **Branch 3 — 已註冊使用者**（帳號存在但未認證）：標記帳號為 verified 並發出完整 session（access token + refresh cookie）作為自動登入

相較於舊流程，它的責任更窄也更安全：

* generate 保持公開，並具備 anti-enumeration 保護
* verify 以原子方式消耗驗證碼，避免 replay
* verify 不會建立新的 user account
* 驗證成功後，根據認證狀態與帳號存在與否路由到對應 branch

### 3. `AuthRoute` 負責 Refresh Rotation 與 Renewal Policy

`AuthRoute` 是專門處理 refresh token 的 Lambda。它的公開路由 `/auth/refresh` 不靠 Bearer token，而是靠 refresh-token cookie 驗證。

refresh 流程會：

* 從 cookie 讀取 refresh token
* 將 token hash 後消耗對應的 refresh-token 記錄
* 拒絕 missing、malformed、expired 或 replayed refresh token
* 發出新的短效 access token
* 重新簽發並輪替 refresh cookie

對 NGO 使用者，refresh 還會保留 `ngoId`、`ngoName` 等 NGO claims，並在 NGO 不再 approved 或 active 時拒絕 refresh。

---

## 安全風險快照 (Security Risk Snapshot)

根據已完成 Lambda 的審計與修復，未重構的 legacy Lambda 若仍有相似 coding pattern，仍可能面臨以下攻擊類別：

* broken authentication：受保護路由可在無有效 JWT 驗證下訪問
* IDOR / horizontal privilege escalation：透過改 path param 或 body field 讀寫他人資料
* unauthorized delete：任意帳戶或寵物資料在無 ownership check 下被刪除
* account takeover：不安全的 upsert-style registration 或 deprecated auth variant 發出錯誤 token
* enumeration：公開端點洩漏使用者、電話或 entity 是否存在
* brute-force / automation abuse：login、registration、SMS 或 destructive routes 缺乏 rate limiting
* JWT tampering：過期 token replay、signature tampering、`alg:none` 攻擊
* mass assignment：呼叫者寫入 `role`、`deleted`、`owner`、`ngoId`、`tagId` 等治理欄位
* sensitive data exposure：原始 DB document 洩漏 password hash、deleted flag 或內部狀態
* NoSQL-style payload abuse：operator-like object 進入本應只接受 scalar value 的邏輯
* session persistence after delete：刪除帳號後 token 未撤銷
* route confusion：模糊 `includes()` route matching 進入錯誤分支
* cross-origin exposure：CORS 過寬或不一致
* raw error leakage：內部 exception 或 validation detail 洩漏給外部

這些類別不是純理論風險，而是從已審計的 legacy Lambda pattern 推導出的實際風險類型。剩餘 Lambda 是否受影響仍需逐路由驗證。

---

## 重構覆蓋率評估

### 1. 已重構 Lambda 的加固程度

在已完成的參考 Lambda 中，加固覆蓋率相對高：

* `UserRoutes` 記錄並處理了 **19 項** legacy security findings。Auth flow 已升級為 **verification-first**（一般使用者無密碼，login/password 路由凍結返回 405）
* `PetBasicInfo` 記錄並處理了 **13 項**涵蓋 auth、ownership、destructive operation、route matching、sanitization 與 error handling 的 findings
* `EmailVerification` 完成公開驗證流程重構、嚴格複審、30/30 整合測試與部署後實機驗證
* `AuthRoute` 具備 22-case suite，覆蓋 handler lifecycle、public-resource bypass、JWT middleware branches、NGO claim preservation、NGO approval denial、replay rejection 與 refresh rotation
* `GetAllPets` 具備 53-case integration suite，覆蓋 public NGO listing、JWT verification、self-access、ownership enforcement、validation、sanitization 與 mutation safety
* `PetLostandFound` 具備 59/59 passing integration suite，覆蓋 pet-lost/pet-found CRUD、notifications CRUD、CORS、JWT auth、guard validation、self-access enforcement、ownership-guarded delete、rate limiting 與 response shape
* `EyeUpload` 具備 94/94 passing integration suite，覆蓋 CORS、JWT auth、dead-route dispatch、schema validation、ownership enforcement、NGO authorization branches、upload validation、rate limiting 與 fixture-backed pet access checks
* `PetDetailInfo` 具備 82/82 passing integration suite，覆蓋 CORS、JWT auth、guard validation、ownership、detail-info、transfer lifecycle、NGO transfer、source/adoption lifecycle、duplicate handling、response shape、NoSQL injection prevention 與 cleanup
* `PetMedicalRecord` 具備 65/65 passing integration suite，另有 3/3 passing blood-test aggregate 單元測試，覆蓋 CORS、JWT auth、guard validation、ownership、medical / medication / deworm / blood-test CRUD、schema strictness、response sanitization 與 schema-bound hard-delete semantics
* `purchaseConfirmation` 具備 65 declared (63/63 passing, 2 skipped) integration suite，覆蓋 CORS、JWT auth、public-route bypass、RBAC、guard validation、dead-route dispatch、Zod validation (purchase + email schemas)、NoSQL injection、admin pagination、soft-cancel lifecycle、server-authoritative pricing、rate limiting 與 response shape consistency
* `SFExpressRoutes` 具備 31-case integration suite（26 項通過，5 項 live/DB 條件測試跳過），另有 15/15 passing 單元測試，覆蓋 JWT、CORS、malformed body、route safety、request validation、rate limiting、SF token retrieval、ownership check、upstream SF failure、cloud-waybill failure 與 email side-effect failure
* `OrderVerification` 具備 39/39 passing SAM-local integration suite，覆蓋 JWT、CORS、guard validation、admin/developer-only order listing、DB-backed ownership checks、supplier fallback lookup、update persistence、sanitized output、duplicate orderId rejection、frozen DELETE、WhatsApp non-dispatch fallback 與 structured handler failure logging
* `PetBiometricRoutes` 具備 41-case SAM-local integration suite，其中最新執行有 33 項實際斷言通過，另有 8 項 business-database-dependent 測試因外部 business cluster 連線限制而被環境條件式跳過；已覆蓋 CORS、JWT auth、exact-route `405`、guard validation、DB-backed ownership、register create/update persistence、rate limiting，以及在外部 business cluster 連線點之前的 verify contract
* `PetVaccineRecords` 具備 **34 / 34 passing** SAM-local integration suite，覆蓋 CORS、JWT auth（含 `alg:none` 與 tampered-signature 分支）、owner/NGO/stranger 授權執行、cross-pet scope 隔離（透過錯誤 `petId` 定址 vaccine record 回傳 `404`）、body 欄位 NoSQL injection 防護、`ACTIVE_VACCINE_FILTER` 軟刪除執行、CRUD lifecycle（create、update、delete、impossible-date 拒絕），以及 fixture-gated 授權覆蓋
* `CreatePetBasicInfo` 具備 **18 / 18 passing** 直接呼叫 handler 測試套件，覆蓋 CORS、JWT auth、guard validation、method enforcement、Zod schema `superRefine` 未知欄位拒絕（body 中的 `userId` 與 `ngoId` 均被拒絕）、NoSQL injection 防護、rate-limiting 行為（無效 JSON 不增加計數器）、server-side `userId` 從 JWT 注入、response 欄位 sanitization，以及重複 `tagId` `409` 處理
* `GetAdoption` 具備 **21 / 21 passing** 純 unit 測試套件（無 SAM，無實際 DB），覆蓋 CORS allowlist、guard validation（invalid ObjectId、page 範圍、search 長度、filter 正規化）、method enforcement、公開路由明確驗證（確認 `authJWT` 從不在 adoption 端點上被呼叫）、`getAdoptionList` service（成功路徑、empty-result `maxPage: 0`、分頁），以及 `getAdoptionById` service（`404`、detail payload shape 含 adoption-website 必要欄位）
* `PetInfoByPetNumber` 具備 **13 / 13 passing** 直接呼叫 handler 測試套件，覆蓋 CORS、guard validation（missing/blank/over-length `tagId`）、method enforcement、DB-backed tag lookup（找到寵物時回傳 sanitized 公開欄位）、missing-tag anti-enumeration（回傳 `200` + all-null form 而非 `404`）、軟刪除寵物 anti-enumeration，以及內部欄位抑制（`userId`、`ngoId`、`ngoPetId`、owner contacts、visibility flags）。此測試階段發現並修復 `functions/PetInfoByPetNumber/src/utils/sanitize.js` 的 null guard bug

合併來看，前 2 個完成審計的 Lambda 直接處理了 **32 項 documented legacy security findings**，另外 `EmailVerification`、`AuthRoute`、`GetAllPets`、`PetLostandFound`、`EyeUpload`、`PetDetailInfo`、`PetMedicalRecord`、`purchaseConfirmation`、`SFExpressRoutes`、`OrderVerification`、`PetBiometricRoutes`、`PetVaccineRecords`、`CreatePetBasicInfo`、`GetAdoption`、`PetInfoByPetNumber` 也已完成嚴格現代化與測試支撐的安全加固。

更準確的說法是定性評估，而不是宣稱固定百分比：已完成的 17 個 Lambda 在其自身 route surface 上，已大幅降低已知 code-owned attack classes。

### 2. 整體 Monorepo 的覆蓋程度

在整個 monorepo 層級，第一階段原位現代化已完成：

* inventory in-plan **17 / 22** 已完成
* **77%** 的 in-plan Lambda 已達新標準
* 剩餘 **23%**（5 個 Lambda）已由管理層標註為「不需要」，列為 out-of-scope
* 另有 **4 個** workspace Lambdas 列為 out-of-plan

正確解讀是：已完成的 17 個 Lambda 內，大部分已知 code-owned attack classes 已被處理。剩餘 5 個 in-plan Lambda 已由管理層標註為「不需要」，不列入本計畫範圍。第一階段原位現代化計畫正式完成。

---

## 已完成參考 Lambda 的核心改進

### 1. 安全漏洞修補

已完成的 refactor 關閉了記錄在各 Lambda `SECURITY.md` 與 test report 中的具體風險。實際效果是讓這些參考 Lambda 更難被常見 API attack path 利用，包括 broken auth、ownership bypass、mass assignment、route confusion、brute-force abuse、enumeration 與 sensitive data leakage。

`PetDetailInfo` 的加固項目包含：

* 13 條 active routes 全部受 JWT 保護，`PUBLIC_RESOURCES = []`
* detail-info、transfer、source、adoption route 全部使用 DB-backed ownership enforcement
* NGO transfer 在 guard layer 執行 NGO RBAC
* target user lookup 使用 anti-enumeration neutral error
* email/phone 必須 cross-validate 到同一個 target user `_id`
* DD/MM/YYYY、YYYY-MM-DD、ISO timestamp 執行 calendar-strict validation
* source/adoption create 使用 `checkDuplicates()` 並返回 `409`
* Pet write predicate 包含 `deleted:false`
* transfer update/delete 包含 embedded transfer id predicate 與 matched-count verification
* source/adoption update/delete 使用 `_id + petId` write scoping
* response 使用 projection 與 sanitizer，避免 raw document leakage

`SFExpressRoutes` 的加固項目包含：

* 從 600 行級 legacy handler 拆分為 handler、router、middleware、config、service、utils、schema、model、locale 模組
* create-order、cloud-waybill print、address token、area、netCode、pickup-location route 全部使用 exact route dispatch
* active routes 全部受 JWT 保護，JWT bypass 僅限非 production
* create-order 在寫入 waybill 到既有 order 時執行 DB-backed tempId ownership check
* token、metadata、create-order、cloud-waybill route 具備 per-action rate limiting
* 所有 request body 使用 Zod validation 與穩定 `sfExpress.*` error keys
* SF address API key 改為環境變數，address-service call 使用 HTTPS
* 單元測試覆蓋 upstream SF API failure、malformed payload、missing waybill、missing print file、email side-effect failure

`OrderVerification` 的加固項目包含：

* 從 580 行級 legacy handler 拆分為 handler、router、middleware、config、service、utils、schema、model、locale 模組
* supplier、ordersInfo、WhatsApp-link、admin list、tag read/update、frozen DELETE route 全部使用 exact route dispatch
* active routes 全部受 JWT 保護，supplier/ordersInfo/WhatsApp-link access 使用 DB-backed ownership checks
* `GET /v2/orderVerification/getAllOrders` 僅允許 admin/developer
* tag update 與 supplier update 使用 schema-backed validation，覆蓋 invalid date、invalid pendingStatus、empty multipart
* 使用 allowlisted projections 與 sanitizer，避免 `discountProof` 等敏感欄位外洩
* duplicate `orderId` update 回傳 `409`
* WhatsApp tracking dispatch 與 DB update 隔離，provider failure 不回滾成功更新
* SAM-local integration tests 覆蓋 ownership、persistence、sanitized output、CORS、JWT、route freezing、handler failure logging

這些安全修復已由以下測試報告支撐：

* [dev_docs/test_reports/USERROUTES_TEST_REPORT.md](dev_docs/test_reports/USERROUTES_TEST_REPORT.md)
* [dev_docs/test_reports/PETBASICINFO_TEST_REPORT.md](dev_docs/test_reports/PETBASICINFO_TEST_REPORT.md)
* [dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md](dev_docs/test_reports/EMAIL_VERIFICATION_TEST_REPORT.md)
* [dev_docs/test_reports/AUTHROUTE_TEST_REPORT.md](dev_docs/test_reports/AUTHROUTE_TEST_REPORT.md)
* [dev_docs/test_reports/GETALLPETS_TEST_REPORT.md](dev_docs/test_reports/GETALLPETS_TEST_REPORT.md)
* [dev_docs/test_reports/PETLOSTANDFOUND_TEST_REPORT.md](dev_docs/test_reports/PETLOSTANDFOUND_TEST_REPORT.md)
* [dev_docs/test_reports/EYEUPLOAD_TEST_REPORT.md](dev_docs/test_reports/EYEUPLOAD_TEST_REPORT.md)
* [dev_docs/test_reports/PETDETAILINFO_TEST_REPORT.md](dev_docs/test_reports/PETDETAILINFO_TEST_REPORT.md)
* [dev_docs/test_reports/PETMEDICALRECORD_TEST_REPORT.md](dev_docs/test_reports/PETMEDICALRECORD_TEST_REPORT.md)
* [dev_docs/test_reports/PURCHASECONFIRMATION_TEST_REPORT.md](dev_docs/test_reports/PURCHASECONFIRMATION_TEST_REPORT.md)
* [dev_docs/test_reports/SFEXPRESSROUTES_TEST_REPORT.md](dev_docs/test_reports/SFEXPRESSROUTES_TEST_REPORT.md)
* [dev_docs/test_reports/ORDERVERIFICATION_TEST_REPORT.md](dev_docs/test_reports/ORDERVERIFICATION_TEST_REPORT.md)
* [dev_docs/test_reports/PETBIOMETRICROUTES_TEST_REPORT.md](dev_docs/test_reports/PETBIOMETRICROUTES_TEST_REPORT.md)

### 2. 性能改善 (Performance)

已完成 refactor 帶來實用的 Lambda runtime 改善：

* thin `index.js` entrypoints 降低入口檔負擔
* lazy route loading 避免每次 invocation 載入無關服務
* singleton MongoDB connection reuse 避免重複連線成本
* 較小的 MongoDB pool sizing 減少 Lambda 側連線浪費
* malformed requests 提早拒絕，避免不必要 DB work
* `.lean()` reads 與 focused projections 減少 Mongoose 與 payload overhead

### 3. 可維護性 (Maintainability)

已完成 Lambda 目前遵循一致生命週期：

* handler orchestration
* CORS preflight
* JWT auth
* guard validation
* DB bootstrap
* ownership / self-access / role checks
* exact router dispatch
* service execution
* centralized response building

這讓工程師在不同 Lambda 間有可預期的檔案結構與責任邊界，降低修改單一路由時造成非預期 regression 的風險。

### 4. 擴展性與穩定性 (Scalability & Stability)

目前的 refactor 改善包括：

* 建立可重複套用的 Lambda shape
* standardized validation、response、logging、auth、CORS、DB reuse pattern
* route-level logic 更容易擴充，不再膨脹單一 god file
* 結構化錯誤回應讓 frontend、測試與 LLM automation 更穩定
* SAM local + MongoDB integration tests 覆蓋真實 request path

---

## 為什麼先選擇原位現代化

目前策略是在不進行大規模 DDD 重寫的情況下，逐一現代化 Lambda。這是此 legacy monorepo 目前最務實的做法，因為它能：

* 逐一替換，避免 big-bang rewrite
* 避免停機或大規模 service migration
* 避免破壞前端既有 API contract
* 立即降低 security、validation、observability、maintainability 風險
* 為未來更深入的架構調整建立安全基線

如果太早進行全面 DDD redesign，團隊會同時面對 legacy ambiguity、hidden contract dependencies、domain decomposition、migration strategy 與 regression prevention，風險會被放大。

目前做法先讓 Lambda 可理解、可測試、可安全修改。完成這個階段後，未來 deeper DDD re-architecture 才更現實。

---

## 結語

截至 2026-04-22，Monorepo 重構工作已產出 17 個可作為基準的參考實作，並累積 **797 項 integration-style 與 direct-handler 測試案例 + 15 項 SFExpressRoutes 單元測試案例 + 6 項 SMS service 單元測試案例 + 28 項 auth-workflow 單元測試案例 + 3 項 PetMedicalRecord aggregate 單元測試**（依 `__tests__` 測試檔統計）。第一階段原位現代化計畫正式完成。

已完成 refactor 顯示出明確改善：

* 安全性
* 性能
* 可維護性
* 擴展性
* 穩定性

這不是最終架構，但它是通往最終架構前必要且正確的基礎。如果目標是在持續交付的同時保護業務，這份 2026-04-22 報告應被視為早期安全風險退場與工程複利累積，而非 cosmetic refactoring。

---

## 附錄（2026-04-22）— 語系與 errorKey 標準化

在完成各 Lambda 的首輪重構後，整個 monorepo 針對 `errorKey` 與語系檔進行了全面標準化，涵蓋 17 個已重構的 Lambda 以及 `purchaseConfirmation`。這次整合為所有 API 錯誤與成功訊息建立了統一、可被機器讀取的格式。

### 問題

標準化前，每個 Lambda 的 `locales/*.json` 各自為政：

* 有些使用扁平鍵名（例如 `"unauthorized"`、`"invalidJSON"`、`"petNotFound"`）。
* 有些使用一層點記法（例如 `"phoneRegister.userExist"`、`"verification.codeExpired"`）。
* 有些使用 `others.*` 命名空間混合特定網域葉節點（例如 `"others.unauthorized"`、`"updateImage.invalidUserId"`）。
* `unauthorized`、`internalError`、`invalidJSON` 等跨切面的錯誤鍵值每個 Lambda 各自重複定義，沒有單一事實來源。
* 英文與中文檔經常漂移 — 其中一個語系存在的鍵，另一個語系卻沒有。

後果：前端與測試程式碼必須硬綁 Lambda-specific 的鍵格式、CloudWatch 過濾器依賴不一致的分類法，新增錯誤訊息時必須猜測應該放進哪個命名空間。

### 統一格式（現已強制執行）

每個 Lambda 的每個 `locales/<lang>.json` 皆遵循：

```json
{
  "common": {
    "unauthorized": "...",
    "internalError": "...",
    "invalidJSON": "...",
    "missingParams": "...",
    "rateLimited": "...",
    "methodNotAllowed": "...",
    "forbidden": "...",
    "...": "..."
  },
  "<lambdaDomainCamel>": {
    "errors":  { "<leaf>": "..." },
    "success": { "<leaf>": "..." }
  }
}
```

* `common.<leaf>` — 所有 Lambda 自共用基準重新匯出的跨切面鍵。
* `<lambdaDomainCamel>.errors.<leaf>` — 特定端點的錯誤訊息。
* `<lambdaDomainCamel>.success.<leaf>` — 特定端點的成功訊息。

`<lambdaDomainCamel>` 為 Lambda 資料夾名稱的 camelCase 形式：

| Lambda 資料夾 | Domain 前綴 |
| --- | --- |
| `AuthRoute` | `authRoute` |
| `CreatePetBasicInfo` | `createPetBasicInfo` |
| `EmailVerification` | `emailVerification` |
| `EyeUpload` | `eyeUpload` |
| `GetAdoption` | `getAdoption` |
| `GetAllPets` | `getAllPets` |
| `OrderVerification` | `orderVerification` |
| `PetBasicInfo` | `petBasicInfo` |
| `PetBiometricRoutes` | `petBiometricRoutes` |
| `PetDetailInfo` | `petDetailInfo` |
| `PetInfoByPetNumber` | `petInfoByPetNumber` |
| `PetLostandFound` | `petLostAndFound` |
| `PetMedicalRecord` | `petMedicalRecord` |
| `PetVaccineRecords` | `petVaccineRecords` |
| `purchaseConfirmation` | `purchaseConfirmation` |
| `SFExpressRoutes` | `sfExpressRoutes` |
| `UserRoutes` | `userRoutes` |

當網域本身有子資源時，允許在 `<domain>.errors` / `<domain>.success` 下再分組 — 例如 `petDetailInfo.errors.petAdoption.invalidDateFormat`、`petMedicalRecord.errors.bloodTest.notFound` 或 `userRoutes.errors.verification.codeExpired`。

### 工具合約

* `utils/response.js::createErrorResponse(statusCode, errorKey, event)` 回傳 `{ success: false, errorKey, error, requestId }`，其中 `errorKey` 為標準點記法路徑。
* `utils/response.js::createSuccessResponse(statusCode, event, data)` 回傳 `{ success: true, message, ...data }`，其中 `message` 由同一標準路徑解析得到。
* `utils/i18n.js::getTranslation(dict, "domain.group.leaf")` 走訪語系 JSON 樹，遇到缺鍵時優雅回退。

`errorKey` 在所有語系下皆保持穩定 — 前端與測試應以 `errorKey` 作為分支依據，絕不應使用 `error`（本地化人類可讀文字）。

### 遷移成果

* 跨 `functions/**`、`shared/**`、`__tests__/**` 共修改 **217 個檔案**。
* 差異量 **+2,281 / −2,355 行** — 淨減少，因為原本每個 Lambda 重複的跨切面扁平鍵，已收斂為共享的 `common.*` 區塊。
* 對 `sam local start-api` 啟動的本機 API 跑完全部 20 個 Jest 套件（5 個單元測試 + 15 個整合測試）皆通過。
* 在驗證過程中發現並修復兩個由遷移引入的 bug：
  1. `functions/PetDetailInfo/src/middleware/ownership.js` 引用了先前重寫時遺留的未定義識別字 `callerNgoId`，已替換為 `event.ngoId`，恢復 `PetDetailInfo` 的 82 筆測試案例。
  2. `__tests__/test-sms-service.test.js` 對 `verifySmsCode` 的新用戶與已驗證用戶流程仍然使用舊期望；已更新以對齊目前的服務行為（每次成功驗證都會 upsert `SmsVerificationCode`；尚未連結到帳戶的電話號碼會回傳 `isNewUser: true`）。
* `__tests__/test-petmedicalrecord.test.js` 與 `__tests__/test-petvaccinerecords.test.js` 有兩個用例仍期望共享 pet-id 驗證錯誤使用舊的 `petDetailInfo.errors.*` 前綴；已更新為各自 Lambda 的前綴。

### 文件連鎖更新（2026-04-22）

同一波更新中，`dev_docs/api_docs/` 下所有 API 參考文件皆已改引用新的標準 `errorKey`：

* `dev_docs/api_docs/README.md` 現已記錄 `common.*` / `<domain>.errors.*` / `<domain>.success.*` 格式並列出所有跨切面 `common.*` 鍵。
* `ACCOUNT_API.md`、`AUTH_FLOW_API.md`、`MEDIA_UPLOAD_API.md`、`NGO_ADMIN_API.md`、`PET_ADOPTION_API.md`、`PET_BIOMETRICS_API.md`、`PET_DETAIL_INFO_API.md`、`PET_HEALTH_API.md`、`PET_LOST_FOUND_API.md`、`PET_PROFILE_API.md`、`PURCHASE_ORDER_API.md` 與 `SF_EXPRESS_API.md` 裡每個端點的錯誤表都已重寫，確保列出的每個 `errorKey` 都原樣存在於對應 Lambda 的 `locales/en.json`。

### 為什麼這件事重要

* **前端的確定性。** `unauthorized`、`internalError`、`rateLimited` 等錯誤現在有單一穩定鍵，前端只需實作一個全域攔截器，而不用為每個 API 客製化。
* **測試衛生。** 整合斷言與 Lambda 實際輸出的鍵完全對齊，任何服務層回歸都會立刻在對應的測試套件裡曝光。
* **可觀測性。** CloudWatch 的 `errorKey` 過濾器現已一致 — 一個 `errorKey=common.internalError` 過濾器就能抓到所有 Lambda 的 500。
* **i18n 就緒。** 新增語系只是翻譯既有葉節點，不需要創造新的鍵路徑。
* **貢獻者阻力。** 新增錯誤只需在兩個語系檔加兩行，並在 `createErrorResponse` 呼叫處引用 — 不再是設計決策。
