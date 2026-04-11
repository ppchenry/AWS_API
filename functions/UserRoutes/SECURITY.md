### 舊版安全性審計 — 19 項現代化前後對照表

#### 關鍵風險 (Critical 1–8)

**發現 1 — Handler 內完全缺乏 JWT 驗證**

* **現代化前：** 舊版檔案完全沒有 `jwt.verify` 呼叫，也沒有處理 `Authorization` 標頭。所有帳戶與 NGO 相關路由（如 `GET/PUT/DELETE /account/{userId}` 等）皆未在 Handler 內執行身份驗證。
* **現代化後：** 實施 `authJWT` 中間件，在路由分發前對所有請求進行檢查。`handler.js` 中明確的 `PUBLIC_RESOURCES` 清單是唯一的白名單。經測試證實：缺少標頭、無效 Token、簽名遭篡改、Token 過期及 `alg:none` 攻擊均會回傳 401。

---

**發現 2 — GET /account/{userId} 回傳未經處理的原始用戶記錄**

* **現代化前：** 舊版直接根據路徑中的 `userId` 抓取並回傳 `user: userData` 完整內容，導致密碼（password）、已刪除標記（deleted）、積分（credit）等內部敏感欄位洩漏給任何知道用戶 ID 的人。
* **現代化後：** `getUserDetails` 改為回傳 `sanitizeUser(resolvedUser)`，明確移除密碼欄位。同時要求有效 JWT，並透過自存取檢查（Self-access check）確保請求者的 JWT `userId` 與路徑參數一致。

---

**發現 3 — PUT /account 允許未經授權修改任意帳號**

* **現代化前：** 舊版更新路由直接從請求主體（Request Body）讀取 `userId` 並更新對應記錄，完全沒有檢查操作者是否擁有該帳號，存在水平權限濫用風險。
* **現代化後：** `selfAccess.js` 會在請求進入 Service 之前，比對 Body 內的 `userId` 與 JWT 中的 `userId`。若不符則回傳 403。

---

**發現 4 — DELETE /account/{userId} 允許未經授權硬刪除任意帳號**

* **現代化前：** 舊版刪除分支直接使用 `deleteOne` 刪除任何要求的用戶 ID，且 Handler 內無任何授權檢查。
* **現代化後：** 強制執行 JWT 驗證與自存取檢查。刪除機制改為「軟刪除」（Soft-delete），將狀態設為 `deleted: true`，並在同一個 `Promise.all` 操作中撤銷（Revoke）該用戶所有的 Refresh Token。

---

**發現 5 — 透過 Email 進行未授權軟刪除，且未撤銷 Session**

* **現代化前：** 舊版根據 Email 接收任何刪除請求，僅標記刪除卻未撤銷 Refresh Token。
* **現代化後：** 強制 JWT 驗證。`selfAccess.js` 會比對 Body 內的 Email 與 JWT 中的用戶 Email。執行軟刪除的同時會呼叫 `RefreshToken.deleteMany` 清除登入狀態。

---

**發現 6 — 透過 /account/register-email-2 等路由進行公然帳號劫持**

* **現代化前：** 舊版 `isEmailRegisterV2` 分支使用 `findOneAndUpdate` 搭配 `upsert: true`，在不要求密碼的情況下直接設為 `verified: true` 並發放 JWT。攻擊者只要知道受害者的 Email 即可取得授權 Token。
* **現代化後：** 相關路由現均回傳 `405 methodNotAllowed`。原有的 V2 註冊邏輯已從代碼庫中完全移除。

---

**發現 7 — POST /account/login-2 導致帳號列舉 (Account Enumeration)**

* **現代化前：** 舊版分支會根據用戶是否存在回傳不同的 Payload（如 `newUser: true/false`），導致攻擊者可以藉此探測特定 Email 或電話是否已註冊。
* **現代化後：** 路由回傳 405，不再洩漏任何用戶存在資訊。

---

**發現 8 — POST /account/generate-sms-code 導致電話列舉**

* **現代化前：** 舊版發送 SMS 分支會區分新舊用戶（`newUser: false` vs `newUser: true`），透過公開接口洩漏電話註冊狀態。
* **現代化後：** 簡訊發送改為回傳通用響應，不再揭露電話號碼是否與現有帳號關聯。

---

#### 高嚴重性 (High Severity 9–13)

**發現 9 — 註冊流程中用戶可自定義角色 (Role)**

* **現代化前：** 多個註冊分支直接讀取 Body 中的 `role` 並寫入資料庫，允許調用者在創建帳號時自行提升權限（例如註冊成管理者）。
* **現代化後：** `register.js` 無條件將角色固定為 `"user"`。Zod Schema 已排除 `role` 欄位，任何傳入的 role 欄位都會在進入 Service 前被剔除。

---

**發現 10 — NGO 編輯功能過度信任 Body 中的 userId**

* **現代化前：** NGO 編輯分支使用 Body 提供的 `userId` 進行查重與更新，導致受保護的身份識別欄位可被攻擊者控制。
* **現代化後：** `editNgo` 改為從經驗證的 JWT（由 `authJWT` 設置）中提取 `event.userId`。Body 中的 `userId` 不在白名單內，會被直接忽略。

---

**發現 11 — deleted 欄位出現在 NGO 編輯白名單中**

* **現代化前：** NGO 編輯分支的 `USER_ALLOWED` 清單包含 `deleted`，允許透過編輯界面修改敏感的帳號生命週期狀態。
* **現代化後：** `USER_ALLOWED` 僅保留姓名、Email、電話與性別。測試證實 Body 中傳入的 `deleted: true` 不會產生任何效果。

---

**發現 12 — NGO 詳情回傳包含密碼的原始 userProfile**

* **現代化前：** `GET /account/edit-ngo/{ngoId}` 分支未經清理直接回傳 `userProfile`，存在密碼雜湊值（Hash）洩漏風險。
* **現代化後：** `getNgoDetails` 改為回傳 `sanitizeUser(pick(0))`，確保密碼欄位被移除。

---

**發現 13 — NGO 用戶列表洩漏內部欄位且缺乏 RBAC 權限控管**

* **現代化前：** 用戶列表分支回傳包含已刪除標記、商業登記資料等內部欄位，且沒有角色存取控制。
* **現代化後：** 使用 `ngoUserListPipeline.js` 進行精確的欄位投影（Projection）。`guard.js` 中的 `NGO_ONLY_RESOURCES` 會在路由分發前強制檢查 `event.userRole === "ngo"`。

---

#### 中等嚴重性 (Medium Severity 14–17)

**發現 14 — 公開流程完全缺乏速率限制 (Rate Limiting)**

* **現代化前：** 登入、註冊、SMS 等流量完全沒有限制，極易遭受暴力破解與自動化攻擊。
* **現代化後：** 在關鍵流程套用 `enforceRateLimit`（基於 MongoDB），針對不同操作設有獨立的 Key、次數限制與時間窗口。

---

**發現 15 — 原始內部錯誤訊息洩漏給客戶端**

* **現代化前：** 多個 Catch 區塊直接回傳 `e.message`，可能洩漏系統內部架構細節。
* **現代化後：** 所有異常統一回傳 `others.internalError`。詳細錯誤資訊僅記錄於 CloudWatch 紀錄中，不對外顯示。

---

**發現 16 — 狀態碼與響應格式不統一**

* **現代化前：** 混合使用原始字串、翻譯 Key 與行內物件，且 400/401/403 等狀態碼使用邏輯混亂。
* **現代化後：** 統一經由 `utils/response.js` 處理。所有錯誤響應固定包含 `success: false`、機器可讀的 `errorKey`、翻譯後的 `error` 訊息及 `requestId`。

---

**發現 17 — 刪除邏輯不一致且未撤銷 Token**

* **現代化前：** 部分分支使用軟刪除，部分使用硬刪除，且多數路徑在刪除後未同步撤銷 Refresh Token。
* **現代化後：** 統一採用軟刪除邏輯，並確保刪除操作與撤銷 Refresh Token 在同一個事務操作中完成。

---

#### 架構風險 (Structural Risk 18–19)

**發現 18 — 使用 includes() 進行模糊字串比對路由**

* **現代化前：** 使用 `event.resource.includes("/login")` 等方式偵測路由，容易造成路由衝突或意外觸發錯誤分支。
* **現代化後：** `router.js` 採用精確匹配 `"${httpMethod} ${event.resource}"` 的鍵值（Key）進行分發，徹底杜絕模糊匹配的風險。

---

**發現 19 — 高達 2681 行的單體 Lambda 耦合所有安全性功能**

* **現代化前：** 路由、驗證、JWT 發放、DB 設置、業務邏輯全部擠在同一個檔案中，修改極易造成連鎖反應。
* **現代化後：** `index.js` 簡化至 6 行。請求生命週期被拆解為 `handler` -> `cors` -> `authJWT` -> `db` -> `guard` -> `router` -> `services` 等多層結構，每一層皆可獨立測試，確保系統穩定與安全。
