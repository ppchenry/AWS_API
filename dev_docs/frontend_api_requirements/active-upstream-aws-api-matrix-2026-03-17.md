# Active Upstream AWS API Matrix

日期：2026-04-23  
驗證方式：只看實際程式碼與 `.env.local`，不使用 `scripts/` 與 `docs/` 作為事實來源

這份文件給 API 同事快速確認三件事：

1. 前端/Server 目前實際會命中的 AWS URL 是哪些
2. 每個路由家族如何在 BFF 被分流到哪個 `API_BASE_*`
3. 哪些 `API_BASE_*` 覆寫槽位程式已支援但目前未設定

## 1) 驗證基準（只取程式碼）

- `app/api/auth/login/route.ts`
- `app/api/bff/[...path]/route.ts`
- `app/api/upload/sign/route.ts`
- `app/api/print-template-assets/sign/route.ts`
- `lib/api/**`（所有 `/api/bff/*`、`/api/upload/sign`、`/api/auth/login` 呼叫點）
- `.env.local`（`API_BASE_*` 與 `AWS_BUCKET_BASE_URL`）

補充：

- 文件內容「不」引用 `scripts/` 與 `docs/` 的歷史敘述。
- 這是靜態代碼盤點，不是 live endpoint 呼叫驗證。

## 2) 目前 `.env.local` 解析出的 AWS Base

| Env | Current Value | 用途摘要 |
| --- | --- | --- |
| `API_BASE_AUTH` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | auth + NGO edit fallback |
| `API_BASE_PETS` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | pet core / v2 basic / create fallback |
| `API_BASE_PET_LIST` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev` | pet list（優先，覆蓋 `API_BASE_PETS`） |
| `API_BASE_DETAIL` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | detail / transfer / source fallback |
| `API_BASE_MEDICAL` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | medical fallback |
| `API_BASE_MEDICATION` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | medication fallback |
| `API_BASE_DEWORM` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | deworm fallback |
| `API_BASE_VACCINE` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | vaccine fallback |
| `API_BASE_BREEDS` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | breed fallback |
| `API_BASE_UTIL` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production` | `/util/uploadImage` fallback |
| `AWS_BUCKET_BASE_URL` | `https://petpetclub.s3.ap-southeast-1.amazonaws.com` | S3 公開 URL base |

## 3) 目前實際命中的 AWS URL 矩陣

欄位定義：

- 前端/Server 呼叫入口：實際發 request 的代碼位置
- BFF 子路徑規則：`/api/bff/...` 對應的 upstream path
- Base Env 優先順序：`routeEnvConfigs.baseEnvNames`
- 目前解析出的 AWS Base URL：依 `.env.local` 解析後的結果
- 完整 URL Pattern：`joinUrl(base, subPath + search)` 的結果樣式

### 3.1 API Gateway（execute-api）

| 前端/Server 呼叫入口 | BFF 子路徑規則 | Base Env 優先順序 | 目前解析出的 AWS Base URL | 完整 URL Pattern | 證據來源 |
| --- | --- | --- | --- | --- | --- |
| `app/login/page.tsx` → `POST /api/auth/login` | `/account/login`（非 `/api/bff`，直接 server route proxy） | `API_BASE_AUTH` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/account/login` | `app/api/auth/login/route.ts` |
| `lib/api/pets/core.ts` | `/pets/pet-list-ngo/{ngoId}` | `API_BASE_PET_LIST` → `API_BASE_PETS` | `.../Dev` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Dev/pets/pet-list-ngo/{ngoId}` | `lib/api/pets/core.ts`, `app/api/bff/[...path]/route.ts` |
| `lib/api/pets/core.ts` | `/pets/{petId}` | `API_BASE_PET_CORE` → `API_BASE_PETS` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}` | 同上 |
| `lib/api/pets/basic-info.ts` | `/v2/pets/{petId}/basic-info` | `API_BASE_PET_BASIC_INFO` → `API_BASE_PETS` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/v2/pets/{petId}/basic-info` | `lib/api/pets/basic-info.ts`, BFF route config |
| `lib/api/pets/basic-info.ts` | `/v2/pets/create-pet-basic-info-with-image` | `API_BASE_PET_CREATE` → `API_BASE_PETS` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/v2/pets/create-pet-basic-info-with-image` | 同上 |
| `lib/api/pets/detail-info.ts` | `/pets/{petId}/detail-info` | `API_BASE_PET_DETAIL_INFO` → `API_BASE_DETAIL` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}/detail-info` | `lib/api/pets/detail-info.ts`, BFF route config |
| `lib/api/pets/transfer-records.ts` | `/pets/{petId}/detail-info/transfer` 與 `/transfer/{transferId}` | `API_BASE_PET_TRANSFER` → `API_BASE_DETAIL` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}/detail-info/transfer/{transferId?}` | `lib/api/pets/transfer-records.ts`, BFF route config |
| `lib/api/pets/source.ts` | `/v2/pets/{petId}/detail-info/source`（含 `/{sourceId}`） | `API_BASE_PET_SOURCE` → `API_BASE_DETAIL` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/v2/pets/{petId}/detail-info/source/{sourceId?}` | `lib/api/pets/source.ts`, BFF route config |
| `lib/api/pets/medical.ts` | `/pets/{petId}/medical-record`（含 `/{medicalRecordId}`） | `API_BASE_PET_MEDICAL_RECORD` → `API_BASE_MEDICAL` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}/medical-record/{medicalRecordId?}` | `lib/api/pets/medical.ts`, BFF route config |
| `lib/api/pets/medication.ts` | `/pets/{petId}/medication-record`（含 `/{medicationRecordId}`） | `API_BASE_PET_MEDICATION_RECORD` → `API_BASE_MEDICATION` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}/medication-record/{medicationRecordId?}` | `lib/api/pets/medication.ts`, BFF route config |
| `lib/api/pets/deworming.ts` | `/pets/{petId}/deworm-record`（含 `/{dewormRecordId}`） | `API_BASE_PET_DEWORM_RECORD` → `API_BASE_DEWORM` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}/deworm-record/{dewormRecordId?}` | `lib/api/pets/deworming.ts`, BFF route config |
| `lib/api/pets/vaccination.ts` | `/pets/{petId}/vaccine-record`（含 `/{vaccineID}`） | `API_BASE_PET_VACCINE_RECORD` → `API_BASE_VACCINE` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/pets/{petId}/vaccine-record/{vaccineID?}` | `lib/api/pets/vaccination.ts`, BFF route config |
| `lib/api/breeds.ts` | `/animal/breed/{species}/zh` | `API_BASE_BREED_LIST` → `API_BASE_BREEDS` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/animal/breed/{species}/zh` | `lib/api/breeds.ts`, BFF route config |
| `lib/api/pet-placement-options.ts` | `/v2/account/edit-ngo/{ngoId}/pet-placement-options` | `API_BASE_NGO_EDIT` → `API_BASE_AUTH` | `.../Production` | `https://udnh87tari.execute-api.ap-southeast-1.amazonaws.com/Production/v2/account/edit-ngo/{ngoId}/pet-placement-options` | `lib/api/pet-placement-options.ts`, BFF route config |

關鍵提醒：

- `pet-list` 是目前唯一明確命中 `Dev` stage 的主流程：  
  `API_BASE_PET_LIST`（已設）優先於 `API_BASE_PETS`（fallback）
- `source` 路徑雖然是 `/v2/pets/...`，但分流到 `API_BASE_DETAIL` 家族，而不是 `API_BASE_PETS`。

### 3.2 S3（presigned upload + public URL）

| 前端/Server 呼叫入口 | 流程 | 目前解析出的 AWS URL | 完整 URL Pattern | 證據來源 |
| --- | --- | --- | --- | --- |
| `lib/api/pets/media.ts` → `POST /api/upload/sign` | server 端用 AWS SDK 簽出 S3 `PUT` URL，再由瀏覽器直傳 | `AWS_BUCKET_BASE_URL` = `https://petpetclub.s3.ap-southeast-1.amazonaws.com` | `https://petpetclub.s3.ap-southeast-1.amazonaws.com/user-uploads/pets/{petId}/{objectId}.{ext}`（public URL） | `app/api/upload/sign/route.ts`, `lib/api/pets/media.ts` |

補充：

- `PUT` 的 presigned URL 是動態生成，主機通常是 S3 區域端點（非 API Gateway）。
- `app/api/print-template-assets/sign/route.ts` 也有 S3 簽名能力，但目前前端主要呼叫是 `POST /api/print-template-assets`（本地存檔流程），此路由未在現有前端主流程中觀測到呼叫。

## 4) 覆寫槽位總表（程式支援，但可能未設定）

來源：`app/api/bff/[...path]/route.ts` 的 `routeEnvConfigs` + `.env.local` 實際值

| 覆寫 Env | fallback Env | `.env.local` 狀態 | 目前有效 Base |
| --- | --- | --- | --- |
| `API_BASE_AUTH_LOGIN` | `API_BASE_AUTH` | unset | `API_BASE_AUTH` (`.../Production`) |
| `API_BASE_NGO_EDIT` | `API_BASE_AUTH` | unset | `API_BASE_AUTH` (`.../Production`) |
| `API_BASE_PET_SOURCE` | `API_BASE_DETAIL` | unset | `API_BASE_DETAIL` (`.../Production`) |
| `API_BASE_PET_CREATE` | `API_BASE_PETS` | unset | `API_BASE_PETS` (`.../Production`) |
| `API_BASE_PET_BASIC_INFO` | `API_BASE_PETS` | unset | `API_BASE_PETS` (`.../Production`) |
| `API_BASE_PET_TRANSFER` | `API_BASE_DETAIL` | unset | `API_BASE_DETAIL` (`.../Production`) |
| `API_BASE_PET_DETAIL_INFO` | `API_BASE_DETAIL` | unset | `API_BASE_DETAIL` (`.../Production`) |
| `API_BASE_PET_MEDICAL_RECORD` | `API_BASE_MEDICAL` | unset | `API_BASE_MEDICAL` (`.../Production`) |
| `API_BASE_PET_MEDICATION_RECORD` | `API_BASE_MEDICATION` | unset | `API_BASE_MEDICATION` (`.../Production`) |
| `API_BASE_PET_DEWORM_RECORD` | `API_BASE_DEWORM` | unset | `API_BASE_DEWORM` (`.../Production`) |
| `API_BASE_PET_VACCINE_RECORD` | `API_BASE_VACCINE` | unset | `API_BASE_VACCINE` (`.../Production`) |
| `API_BASE_BREED_LIST` | `API_BASE_BREEDS` | unset | `API_BASE_BREEDS` (`.../Production`) |
| `API_BASE_UPLOAD_IMAGE` | `API_BASE_UTIL` | unset | `API_BASE_UTIL` (`.../Production`) |
| `API_BASE_PET_LIST` | `API_BASE_PETS` | set | `API_BASE_PET_LIST` (`.../Dev`) |
| `API_BASE_PET_CORE` | `API_BASE_PETS` | unset | `API_BASE_PETS` (`.../Production`) |

## 5) 盤點邊界與限制

- 本文件只盤點「目前程式碼實際呼叫鏈 + `.env.local` 值」。
- 不推導其他部署環境（例如雲端環境變數若不同，結果會不同）。
- 不包含 `scripts/` 與 `docs/` 內容的推論。
- 不包含敏感資訊（例如 API key / secret）。

## 6) 快速重查指令（僅供下次更新）

```bash
rg -n --hidden --glob '!docs/**' --glob '!scripts/**' "/api/bff|/api/auth/login|/api/upload/sign|execute-api|amazonaws" app components lib hooks middleware.ts next.config.js .env.local
rg -n "baseEnvNames|WHITELIST_PREFIXES" app/api/bff/[...path]/route.ts
rg -n "^API_BASE_|^AWS_BUCKET_BASE_URL=" .env.local
```
