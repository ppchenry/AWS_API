### 舊版安全性審計 — 20 項現代化前後對照表

本文件根據 `functions/PetDetailInfo` 完成 UserRoutes 風格重構後的實作內容，以及 82 個 SAM 整合測試的驗證結果撰寫。

各項發現依照 `functions/UserRoutes/SECURITY.md` 的分類格式呈現：每一項遺留風險均對應至目前的緩解措施，或在該 Lambda 不涉及相關流程時標記為「不適用」。

#### 關鍵風險 (Critical C1–C8)

**發現 C1 — Handler 路由缺乏強制 JWT 驗證**

* **現代化前：** 受保護的寵物詳情、轉移、來源、領養路由在單體式 Lambda 中處理，認證邏輯與路由邏輯緊密耦合，難以一致性審計。
* **現代化後：** `authJWT` 在所有非 OPTIONS 路由前無條件執行。`handler.js` 中明確宣告 `PUBLIC_RESOURCES = []`。JWT 驗證固定使用 HS256，缺少標頭、格式錯誤的 Bearer 值、過期 token、錯誤密鑰 token 及 `alg:none` 攻擊均以 `401 others.unauthorized` 拒絕。

---

**發現 C2 — 回應回傳原始或過於寬泛的實體資料**

* **現代化前：** 詳情、來源、領養回應可能回傳比前端契約所需更廣泛的 DB 文件，因為 projection 與 sanitization 邊界未集中管理。
* **現代化後：** 讀取操作使用明確 projection，服務回應均透過 `sanitizePetDetail`、`sanitizeSource` 或 `sanitizeAdoption` 處理。領養讀取使用明確的 `ADOPTION_PROJECTION`。NGO 轉移中的用戶查詢僅 select `_id`，不回傳至客戶端。

---

**發現 C3 — 寵物資源的橫向權限提升**

* **現代化前：** 呼叫者可透過更改 `petID` 指向其他用戶的寵物，除非每個路由分支都各自實施所有權驗證。
* **現代化後：** `ownership.js` 在 DB 連線後、路由分發前載入寵物。要求 `pet.userId === event.userId` 或 `pet.ngoId === event.ngoId`。不符合時回傳 `403 others.forbidden`；寵物不存在或已刪除時回傳 `404 petNotFound`。

---

**發現 C4 — 破壞性操作缺乏物件層級授權**

* **現代化前：** 轉移與領養刪除路徑風險高，因為破壞性寫入未受到統一的 DB-backed 所有權邊界保護。
* **現代化後：** 所有刪除操作在服務執行前均需有效 JWT 與所有權驗證。轉移刪除使用完整的守衛謂詞 `{ _id: petID, deleted: false, "transfer._id": transferId }` 並檢查 `matchedCount`。領養刪除使用 `_id + petId` 並檢查 `deletedCount`。

---

**發現 C5 — 刪除後缺乏 Session/Token 撤銷**

* **現代化前：** 此類別適用於擁有 session 或 refresh token 的 Lambda。
* **現代化後：** 不適用。PetDetailInfo 不發行 token、不儲存 refresh token，也不管理用戶 session。

---

**發現 C6 — 基於 Upsert 的帳號或所有權接管**

* **現代化前：** 此類別適用於透過 upsert 建立或更新身份的注冊/認證流程。
* **現代化後：** 不適用。PetDetailInfo 沒有基於 upsert 的帳號建立流程。來源/領養建立操作為一般文件建立，且在服務執行前均已通過所有權驗證。

---

**發現 C7 — 公開實體列舉**

* **現代化前：** 公開未認證的查詢路由可能洩漏目標記錄是否存在。
* **現代化後：** 不適用於一般路由存取，因為 PetDetailInfo 沒有公開非 OPTIONS 路由。所有讀取與寫入均需 JWT 與寵物所有權。

---

**發現 C8 — NGO 轉移中的目標用戶列舉**

* **現代化前：** NGO 轉移可能因 email 或電話號碼未找到時回傳不同錯誤，洩漏目標帳號的存在性。
* **現代化後：** NGO 轉移對 email 或電話查詢均未命中時統一回傳中立的 `404 ngoTransfer.targetUserNotFound`。同時要求 email 與電話必須解析到同一個 `_id`，否則回傳 `400 ngoTransfer.userIdentityMismatch`。

---

#### 高嚴重性 (High Severity H9–H13)

**發現 H9 — 呼叫者可控制的角色或權限賦予**

* **現代化前：** 若請求主體可賦予特權角色或所有權，存在提權風險。
* **現代化後：** 客戶端提交的角色不用於任何權限賦予。NGO 授權僅來自已驗證的 JWT `userRole` 聲明，並在 `guard.js` 中進行檢查。

---

**發現 H10 — Body 中的身份欄位被信任為呼叫者授權依據**

* **現代化前：** 若 body 中的身份欄位被用來決定誰有權限修改資源，存在跨帳號操作風險。
* **現代化後：** 呼叫者授權來自 JWT 聲明與 DB-loaded 寵物狀態，而非請求 body 的身份欄位。NGO 轉移的目標身份（`UserEmail`、`UserContact`）僅作為業務資料處理，不授予呼叫者任何權限。

---

**發現 H11 — 更新 Allowlist 中暴露敏感欄位**

* **現代化前：** 寬泛的更新物件或直接展開 body 可能允許批量賦值 `deleted`、`userId`、`ngoId` 等內部狀態欄位。
* **現代化後：** Zod schema 僅暴露各路由特定的欄位，服務層構建明確的更新 map。未知欄位被剔除。若剔除後無有效更新欄位，更新路由回傳 `400 others.noFieldsToUpdate`、`petSource.noFieldsToUpdate` 或 `petAdoption.noFieldsToUpdate`。

---

**發現 H12 — 轉移查詢回傳敏感用戶資料**

* **現代化前：** NGO 轉移需透過 email 與電話查詢目標用戶，若回傳完整用戶文件可能洩漏密碼雜湊、刪除狀態等敏感欄位。
* **現代化後：** 目標用戶查詢僅 select `_id`。NGO 轉移服務不回傳任何用戶文件、密碼雜湊、刪除標記或個人資料。

---

**發現 H13 — NGO 專屬操作缺乏 RBAC 控管**

* **現代化前：** NGO 轉移行為若僅實作於服務邏輯內，路由分支的邊界容易在後續修改中漂移。
* **現代化後：** `guard.js` 包含 `NGO_ONLY_RESOURCES`，在 DB 連線與所有權/服務邏輯執行前，以 `403 others.ngoOnly` 拒絕非 NGO 的有效 token。

---

#### 中等嚴重性 (Medium Severity M14–M17)

**發現 M14 — 缺乏速率限制**

* **現代化前：** 公開憑證、驗證碼發送或未認證的破壞性路由通常需要速率限制。
* **現代化後：** 不適用於公開濫用控制，因為此 Lambda 沒有公開非 OPTIONS 路由，也沒有憑證/驗證碼發送流程。所有操作均需 JWT，破壞性操作受所有權驗證保護。若未來新增公開路由，必須遵循 UserRoutes 的速率限制模式。

---

**發現 M15 — 原始內部錯誤訊息洩漏給客戶端**

* **現代化前：** 單體式 Handler 的 catch 區塊常直接回傳 `e.message` 或不一致的原始錯誤。
* **現代化後：** 服務層記錄伺服器端細節，回傳統一的 `others.internalError` 回應。面向客戶端的錯誤使用穩定的 `errorKey` 值與翻譯後的訊息。

---

**發現 M16 — 狀態碼與回應格式不一致**

* **現代化前：** 不一致的回應 payload 使前端處理、自動化測試和 LLM 整合變得脆弱。
* **現代化後：** 所有服務回應使用 `createSuccessResponse` 或 `createErrorResponse`。錯誤回應包含 `success: false`、`errorKey`、`error` 及（Lambda context 提供時的）`requestId`。成功回應包含 `success: true`。

---

**發現 M17 — 刪除邏輯不影響 Session**

* **現代化前：** 帳號刪除路由必須撤銷相關 session。
* **現代化後：** 不適用。PetDetailInfo 刪除路由不刪除用戶帳號，也不管理 session。僅在 JWT 與寵物所有權驗證後刪除轉移/領養的領域記錄。

---

#### 架構性風險 (Structural S18–S19)

**發現 S18 — 模糊路由匹配**

* **現代化前：** 單體式路由邏輯常使用 `includes()` 或依賴分支順序進行匹配，可能將請求導向錯誤的 handler。
* **現代化後：** `router.js` 使用精確鍵值分發：`"${event.httpMethod} ${event.resource}"`。到達 Lambda 但不在對應表中的 method/resource 組合回傳 `405 others.methodNotAllowed`。

---

**發現 S19 — 單體式 Lambda 耦合所有安全敏感行為**

* **現代化前：** 路由、驗證、DB 存取、所有權檢查、業務邏輯與回應處理耦合在單一大型檔案中，增加回歸風險。
* **現代化後：** `index.js` 委派至 `src/handler.js`；職責分散於 middleware、services、config、utils、schemas、models 與 locales。請求生命週期明確：OPTIONS → authJWT → guard → DB → ownership → router → service。

---

#### PetDetailInfo 特定風險

**發現 I20 — 並發建立時的來源/領養記錄重複**

* **現代化前：** 來源與領養的建立流程可能為同一寵物建立重複記錄。
* **現代化後：** 建立服務先執行 Zod 驗證，再使用共用的 `checkDuplicates()` helper，一般重複請求回傳 `409 petSource.duplicateRecord` 或 `409 petAdoption.duplicateRecord`。剩餘風險屬基礎設施層：真正的並發請求安全仍需在 `pet_sources.petId` 與 `pet_adoptions.petId` 上建立唯一索引。

---

#### 已驗證的安全行為

整合測試套件 `__tests__/test-petdetailinfo.test.js` 共 82 個測試全數通過，驗證了：

* CORS 允許來源/拒絕來源/缺少來源標頭的行為
* 缺少、過期、格式錯誤、錯誤密鑰、無 Bearer 前綴及 `alg:none` JWT 拒絕
* `petID`、`transferId`、`sourceId`、`adoptionId` 的非法 ObjectId 格式拒絕
* malformed JSON 與空 body 拒絕
* 詳情、轉移、來源、領養路由的跨所有者存取拒絕
* NGO 轉移的 Guard 層 RBAC
* DD/MM/YYYY、YYYY-MM-DD 與支援的 ISO 時間戳格式的嚴格日期驗證
* 來源/領養重複建立的 `409` 回應
* 轉移刪除的 `matchedCount` 行為
* 來源/領養的 `petId` 範圍寫入
* 未知欄位剔除 / 批量賦值防護
* NoSQL operator 格式 payload 的拒絕或純量處理

最新驗證結果：

```text
PASS  __tests__/test-petdetailinfo.test.js (114.624 s)
Test Suites: 1 passed, 1 total
Tests:       82 passed, 82 total
```

#### 殘餘風險

唯一已知的殘餘項目屬基礎設施層：需在 `pet_sources.petId` 與 `pet_adoptions.petId` 上建立唯一索引。若缺少這些索引，兩個並發的建立請求仍可在任一插入提交前通過應用層的重複檢查。
