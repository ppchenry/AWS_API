### 舊版安全性審計 — 19 項現代化前後對照表

#### 關鍵風險 (Critical 1–8)

**發現 1 — Handler 內完全缺乏 JWT 驗證**

* **現代化前：** 舊版 `index.js` 將路由、驗證與業務邏輯混在同一個大型 Handler 中，所有醫療記錄相關路由都沒有經過統一、可驗證的 JWT middleware 邊界。這使保護路由是否真的有做身分驗證高度依賴分支內部的舊寫法，容易漏掉或回歸。
* **現代化後：** [`src/handler.js`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/handler.js) 先執行 `authJWT`，`PUBLIC_RESOURCES` 明確為空陣列，代表所有非 `OPTIONS` 路由都必須通過 JWT 驗證。測試已覆蓋缺少標頭、過期 token、垃圾 token、簽名遭篡改與 `alg:none` 攻擊，全部回傳 `401`。

---

**發現 2 — API 回傳未經清理的原始資料庫文件**

* **現代化前：** 舊版醫療 / 藥物 / 驅蟲 / 驗血紀錄流程直接回傳 Mongoose 文件或手工組裝資料，缺乏集中化的輸出清理邊界，容易把 `__v`、`createdAt`、`updatedAt` 等內部欄位帶給前端。
* **現代化後：** 所有紀錄型回應都經過 [`sanitizeRecord`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/utils/sanitize.js) 清理後再交給 `createSuccessResponse()`。整合測試已明確驗證醫療與藥物紀錄回應不再外洩這些內部欄位。

---

**發現 3 — 透過 Body 內身分欄位進行水平越權**

* **現代化前：** 舊版路由把 ownership 與資料變更放在同一個單體流程中，缺乏清楚的「JWT 身分」與「目標 pet 資源」驗證邊界，理論上存在把 caller-controlled body payload 與真正授權來源混用的風險。
* **現代化後：** 此 Lambda 的授權核心不再信任 Body 內的任何 user identity，而是先透過 [`loadAuthorizedPet`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/middleware/selfAccess.js) 讀取 pet，再比對 `event.userId` / `event.ngoId` 與 pet 的 `userId` / `ngoId`。也就是說，授權來源固定來自 JWT 與資料庫中的 pet 關聯，而不是客戶端傳入欄位。

---

**發現 4 — DELETE 路由可能在無驗證或無授權下執行**

* **現代化前：** 舊版 DELETE 分支與其他路由寫在同一個大型檔案中，缺乏統一 middleware lifecycle；一旦某個分支遺漏驗證或 ownership 邏輯，刪除就可能被錯誤暴露。
* **現代化後：** 所有 DELETE 請求一律先經過 JWT 驗證，再通過 pet ownership / NGO ownership 檢查，且刪除條件同時綁定記錄 `_id` 與 `petId`。本次保留 hard delete，但這是因為底層 medical-domain record schema 本身沒有 `deleted` 欄位，屬於 schema-bound contract choice，而不是未受保護的刪除漏洞。

---

**發現 5 — 刪除後仍可能留下有效 Session**

* **現代化前：** 若 Lambda 本身負責帳戶或 session lifecycle，刪除但不撤銷 token 會形成持續授權風險。
* **現代化後：** **不適用。** `PetMedicalRecord` 只管理醫療紀錄文件，不發 JWT、不管理 refresh token，也不處理帳戶 session，因此不存在本 Lambda 需要在 delete flow 同步撤銷 session 的問題。

---

**發現 6 — 透過 upsert 型建立流程造成帳戶或資料接管**

* **現代化前：** 若使用 `findOneAndUpdate + upsert` 作為建立流程，且未綁定 caller identity，可能被利用建立或接管資料。
* **現代化後：** **不適用。** 這個 Lambda 沒有任何 upsert-based creation flow；所有建立紀錄都走明確的 `Model.create()`，且 `petId` 由路徑參數與授權 pet 決定。

---

**發現 7 — 公開查詢端點造成 entity enumeration**

* **現代化前：** 公開查詢型路由若根據資源是否存在回傳不同訊息，可能被用來列舉資料。
* **現代化後：** **不適用。** 這個 Lambda 沒有任何公開查詢路由；除 `OPTIONS` 外所有路由都必須先通過 JWT。

---

**發現 8 — 驗證碼 / 驗證端點造成 identifier enumeration**

* **現代化前：** 若有 email / phone verify 類端點，常見風險是透過差異化回應列舉 identifier 是否已存在。
* **現代化後：** **不適用。** `PetMedicalRecord` 沒有任何驗證碼、驗證、或帳號識別端點。

---

#### 高嚴重性 (High Severity 9–13)

**發現 9 — 建立流程允許客戶端自定義權限欄位**

* **現代化前：** 若記錄建立流程接受 `role`、`tier`、`isAdmin` 等欄位，可能造成權限提升。
* **現代化後：** **不適用。** 此 Lambda 的建立 schema 僅接受醫療紀錄領域欄位，不存在任何權限或角色欄位。

---

**發現 10 — 編輯流程過度信任 Body 內的身分欄位**

* **現代化前：** 舊版大型 handler 把授權與更新揉在一起，容易讓 update flow 誤用 body payload 當成 caller identity。
* **現代化後：** 所有 update service 的 ownership 都來自 JWT 附加到 `event` 的身分，再加上資料庫讀出的 pet 關聯驗證；更新 payload 本身不包含任何可作為 caller identity 的欄位。

---

**發現 11 — 敏感生命週期欄位出現在可編輯 allowlist / schema**

* **現代化前：** 若 `deleted`、`verified`、`role`、`credit`、`tokenHash` 等欄位出現在更新白名單或 schema 中，會產生 mass assignment 風險。
* **現代化後：** [`medicalSchema.js`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/zodSchema/medicalSchema.js)、[`medicationSchema.js`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/zodSchema/medicationSchema.js)、[`dewormSchema.js`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/zodSchema/dewormSchema.js)、[`bloodTestSchema.js`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/zodSchema/bloodTestSchema.js) 都是 strict schema，且只允許領域欄位。敏感生命週期欄位不在 schema 內，也不會進入 `$set`。

---

**發現 12 — API 回應外洩敏感憑證或密碼雜湊**

* **現代化前：** 若回應直接回傳 user / auth 相關資料，可能把 password hash 等欄位洩漏出去。
* **現代化後：** **不適用。** `PetMedicalRecord` 不回傳帳戶或憑證實體；它只回傳經過 sanitize 的紀錄文件。

---

**發現 13 — 缺乏 RBAC 導致受限資源被錯誤存取**

* **現代化前：** 若某些路由理論上只允許特定角色，卻沒有在 guard 階段做 RBAC，容易造成 privilege escalation。
* **現代化後：** **不適用。** 此 Lambda 沒有 UserRoutes 式的角色分流資源集合；有效授權模型是「pet owner 或 matching NGO」皆可存取同一組 pet-scoped route，這是 ownership policy，不是 role-tier RBAC surface。

---

#### 中等嚴重性 (Medium Severity 14–17)

**發現 14 — 公開敏感流程完全缺乏速率限制**

* **現代化前：** login / register / verify 類公開流程若缺乏 rate limiting，會增加暴力破解與自動化濫用風險。
* **現代化後：** **不適用。** `PetMedicalRecord` 沒有公開 login / register / verify 路由；除 `OPTIONS` 外全部路由都需要有效 JWT，且主要是已授權 pet 的紀錄操作。

---

**發現 15 — 原始內部錯誤訊息直接暴露給客戶端**

* **現代化前：** 舊版大型 handler 若直接回傳 `error.message` 或 Mongoose cast error，會洩漏內部實作細節。
* **現代化後：** 所有 service 與外層 handler catch block 都統一透過 `logError()` 記錄，對外只回傳 `createErrorResponse(500, "others.internalError", event)`。詳細錯誤留在結構化日誌中，不會直接暴露給 API caller。

---

**發現 16 — 狀態碼與回應格式不一致**

* **現代化前：** 單體式 handler 常見問題是不同分支使用不同 status code、不同 response shape，導致前端與測試難以穩定依賴。
* **現代化後：** 所有成功與錯誤回應統一透過 [`utils/response.js`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/utils/response.js) 建立，錯誤回應固定包含 `success: false`、`errorKey`、`error`、`requestId`。

---

**發現 17 — 刪除語義不一致或與 token revocation 邏輯耦合不清**

* **現代化前：** 若部分路由軟刪除、部分硬刪除，或刪除與 session revocation 流程糾纏，容易產生行為漂移。
* **現代化後：** 此 Lambda 的 delete semantics 現在明確且一致：medical / medication / deworm / blood-test record 都保留 hard delete，因為 schema 沒有 `deleted` 欄位；同時本 Lambda 不管理 token/session，因此不存在需要在此處做 revocation 的邏輯缺口。

---

#### 架構風險 (Structural Risk 18–19)

**發現 18 — 使用模糊字串比對進行路由分發**

* **現代化前：** 舊版大型 `index.js` 以 `event.path` / 分支判斷混合處理 16 條路由，存在 `includes()` / 模糊路由分發的典型風險，容易把請求送入錯誤邏輯。
* **現代化後：** [`src/router.js`](C:/Users/jimmy/Documents/vscode/lambda-monorepo/functions/PetMedicalRecord/src/router.js) 以精確的 `"${event.httpMethod} ${event.resource}"` 鍵值做路由分發，未知方法統一回傳 `405 others.methodNotAllowed`。

---

**發現 19 — 單體 Lambda 將 routing / auth / validation / DB / business logic 高度耦合**

* **現代化前：** 舊版 `PetMedicalRecord/index.js` 為高行數單體檔案，將 DB 連線、驗證、授權、路由與四種紀錄領域邏輯全部揉在一起，任何修改都容易造成安全回歸。
* **現代化後：** 目前 request lifecycle 已拆為 `handler -> cors -> authJWT -> guard -> db -> router -> services`。`index.js` 只保留薄入口，DB 連線、guard、router、service、response、logger、schema 各自獨立，安全行為更容易追蹤、測試與維護。
