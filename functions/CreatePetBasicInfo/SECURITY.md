### 舊版安全性審計 — 12 項現代化前後對照表

#### 關鍵風險 (Critical 1–5)

**發現 1 — 寵物建立路由缺乏 JWT 驗證**

* **現代化前：** 寵物建立端點未要求有效 JWT，未認證的呼叫者可直接建立寵物記錄。
* **現代化後：** `authJWT({ event })` 無條件呼叫，`PUBLIC_RESOURCES = []` 表示路由均需有效 JWT。缺少標頭、過期、簽名遭篡改或 `alg:none` 攻擊均直接回傳 `401`。

---

**發現 2 — 批量賦值 (Mass Assignment)：userId 可由呼叫者控制**

* **現代化前：** 若 `userId` 從請求主體讀取並直接寫入 DB，攻擊者可在任意帳號下建立寵物記錄，實現跨帳號資料汙染。
* **現代化後：** Zod schema 使用 `superRefine` 明確拒絕 body 中含有 `userId` 或 `ngoId` 的請求（回傳 `400 unknownField`）；建立操作使用 `Pet.create({ userId: user._id, ... })`，`userId` 永遠從已驗證的 JWT 注入，不受 body 影響。

---

**發現 3 — 寵物建立缺乏速率限制，易遭自動化濫用**

* **現代化前：** 建立路由無任何限流，攻擊者可使用已認證帳號大量產生寵物記錄，造成資料庫資源消耗。
* **現代化後：** `enforceRateLimit({ action: "createPetBasicInfo", identifier: event.userId, limit: 20, windowSec: 300 })` 在方法驗證之後、Zod 之前執行；超限回傳 `429 others.rateLimited`。

---

**發現 4 — 寫入操作缺乏 Zod Schema 驗證，存在 NoSQL 注入風險**

* **現代化前：** 請求 body 未經類型驗證直接傳遞至 Mongoose，攻擊者可在名稱等字串欄位傳入 `{ "$ne": "" }` 等 operator-like object。
* **現代化後：** `createPetSchema.safeParse(guardResult.body)` 確保所有欄位類型正確；Schema 使用 `superRefine` 明確拒絕未知欄位，object 型別輸入在 schema 層即被拒絕。

---

**發現 5 — 已軟刪除用戶仍可建立寵物記錄**

* **現代化前：** 若未檢查用戶的有效性，已被軟刪除的帳號在 token 未過期前仍可執行建立操作，產生孤立的寵物記錄。
* **現代化後：** Handler 在 Zod 驗證後執行 `User.findOne({ _id: event.userId, deleted: { $ne: true } })`；已刪除或不存在的用戶直接回傳 `404 userNotFound`，不進入建立流程。

---

#### 高嚴重性 (High Severity 6–9)

**發現 6 — 方法未在 DB 連線前強制驗證**

* **現代化前：** 非 POST 方法（如 GET、DELETE）在被拒絕前可能已建立 DB 連線，造成不必要的資源消耗。
* **現代化後：** 方法驗證在 DB 連線前執行：`routeKey !== "POST /pets/create-pet-basic-info"` → `405 others.methodNotAllowed`，有效防止非法方法進入服務層。

---

**發現 7 — 重複 tagId 插入未作衝突偵測**

* **現代化前：** 對同一 `tagId` 的重複建立請求可能造成 Mongoose 唯一索引錯誤並洩漏索引細節。
* **現代化後：** Service 層先執行 `Pet.findOne({ tagId: validated.tagId, deleted: { $ne: true } })` 前置查重；重複時回傳 `409 duplicatePetTagId`，不觸達 Mongoose 唯一索引衝突。

---

**發現 8 — 回應未使用 Allowlist Projection，內部欄位可能外洩**

* **現代化前：** 建立成功後直接回傳 Mongoose 文件，`userId`、`ngoId`、`deleted`、`transferNGO` 等內部欄位可能出現在 `201` 回應中。
* **現代化後：** `sanitizePet(pet)` 使用明確 allowlist（`_id`、`name`、`birthday`、`weight`、`sex`、`sterilization`、`animal`、`breed`、`features`、`info`、`status`、`breedimage`、`tagId`、`receivedDate`），所有內部欄位均從回應中排除。

---

**發現 9 — JSON 與 Body 驗證邊界不足**

* **現代化前：** malformed JSON 或空 body 可能在深層邏輯才失敗，造成非預期的 500 錯誤。
* **現代化後：** `validateRequest` guard 對 malformed JSON 回傳 `400 others.invalidJSON`；空 body 回傳 `400 others.missingParams`。

---

#### 中等嚴重性 (Medium Severity 10–12)

**發現 10 — 無效 Body 不應計入速率限制計數器**

* **現代化前：** 若 malformed JSON 或 schema 驗證失敗的請求仍計入限流計數器，攻擊者可透過大量無效請求耗盡目標用戶的配額，對其造成拒絕服務。
* **現代化後：** 速率限制在方法驗證後、JSON 解析與 Zod 驗證後執行；malformed JSON 請求在進入限流計數前即被拒絕，不消耗呼叫者配額。

---

**發現 11 — CORS 邊界不一致造成跨來源暴露**

* **現代化前：** 預檢處理不一致時，寵物建立路由可能被非允許來源探測或調用。
* **現代化後：** OPTIONS 對未知來源回傳 `403`，允許來源才回傳 `204` 與對應 CORS header。

---

**發現 12 — 錯誤回應缺乏機器可讀鍵值**

* **現代化前：** 回應格式不統一，前端或監控難以穩定解析錯誤類型。
* **現代化後：** 所有錯誤回應固定包含 `success: false`、`errorKey`（`pet.*` 命名空間）、`error` 訊息及 `requestId`。
