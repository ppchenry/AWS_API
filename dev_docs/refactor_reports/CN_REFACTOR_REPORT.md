# Monorepo é‡æ§‹é€²åº¦å ±å‘Šï¼ˆ2026-04-22ï¼‰

## æ¦‚è¿° (Overview)

åœ¨ç›®å‰é€™ä¸€éšŽæ®µçš„ Monorepo ç¾ä»£åŒ–å·¥ç¨‹ä¸­ï¼Œå·²å®Œæˆ 17 å€‹ Lambda å‡½å¼çš„åŽŸä½ (in-place) é‡æ§‹ï¼š

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

æ­¤é …å·¥ä½œéš¸å±¬æ–¼ [README.md](README.md) ä¸­å®šç¾©çš„ Monorepo æ¸…ç†è¨ˆåŠƒï¼Œéµå¾ª [dev_docs/REFACTOR_CHECKLIST.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/REFACTOR_CHECKLIST.md) çš„ç¾ä»£åŒ–åŸºæº–ï¼Œä¸¦ä¾æ“š [dev_docs/LAMBDA_REFACTOR_INVENTORY.md](https://github.com/ppchenry/AWS_API/blob/master/dev_docs/LAMBDA_REFACTOR_INVENTORY.md) çš„å„ªå…ˆé †åºåŸ·è¡Œã€‚

ç›®å‰ä¾ `__tests__` æ¸¬è©¦æª”çµ±è¨ˆçš„æ¸¬è©¦æ¡ˆä¾‹æ•¸ï¼š

* `UserRoutes`ï¼š`__tests__/test-userroutes.test.js` å…§ **93 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**ï¼Œå¦æœ‰ `__tests__/test-sms-service.test.js` å…§ **6 é … SMS service å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹**ï¼Œä»¥åŠ `__tests__/test-authworkflow.test.js` å…§ **28 é … auth-workflow å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹**
* `PetBasicInfo`ï¼š`__tests__/test-petbasicinfo.test.js` å…§ **37 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**
* `EmailVerification`ï¼š`__tests__/test-emailverification.test.js` å…§ **30 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**
* `AuthRoute`ï¼š`__tests__/test-authroute.test.js` å…§ **22 é …æ¸¬è©¦æ¡ˆä¾‹**
* `GetAllPets`ï¼š`__tests__/test-getallpets.test.js` å…§ **53 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**
* `PetLostandFound`ï¼š`__tests__/test-petlostandfound.test.js` å…§ **59 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**
* `EyeUpload`ï¼š`__tests__/test-eyeupload.test.js` å…§ **94 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**
* `PetDetailInfo`ï¼š`__tests__/test-petdetailinfo.test.js` å…§ **82 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**
* `PetMedicalRecord`ï¼š`__tests__/test-petmedicalrecord.test.js` å…§ **65 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**ï¼Œå¦æœ‰ `__tests__/test-petmedicalrecord-bloodtest-aggregate.test.js` å…§ **3 é … blood-test aggregate å–®å…ƒæ¸¬è©¦**
* `purchaseConfirmation`ï¼š`__tests__/test-purchaseconfirmation.test.js` å…§ **65 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**ï¼ˆ63 é …é€šéŽï¼Œ2 é …æ¢ä»¶è·³éŽï¼‰
* `SFExpressRoutes`ï¼š`__tests__/test-sfexpressroutes.test.js` å…§ **31 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**ï¼ˆ26 é …é€šéŽï¼Œ5 é …æ¢ä»¶è·³éŽï¼‰ï¼Œå¦æœ‰ `__tests__/test-sfexpressroutes-unit.test.js` å…§ **15 é …å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹**
* `OrderVerification`ï¼š`__tests__/test-orderverification.test.js` å…§ **39 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**
* `PetBiometricRoutes`ï¼š`__tests__/test-petbiometricroutes.test.js` å…§ **41 é …æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**ï¼›æœ€æ–° SAM-local åŸ·è¡Œä¸­æœ‰ **33 é …å¯¦éš›åŸ·è¡Œä¸¦é€šéŽ**ï¼Œå¦æœ‰ **8 é …** å› å¤–éƒ¨ business cluster ç„¡æ³•å¾žç›®å‰æ©Ÿå™¨é€£ç·šè€Œè¢«ç’°å¢ƒæ¢ä»¶å¼è·³éŽ
* `PetVaccineRecords`ï¼š`__tests__/test-petvaccinerecords.test.js` å…§ **34 é … SAM æ•´åˆæ¸¬è©¦æ¡ˆä¾‹**ï¼Œå…¨éƒ¨é€šéŽ
* `CreatePetBasicInfo`ï¼š`__tests__/test-createpetbasicinfo-unit.test.js` å…§ **18 é …ç›´æŽ¥å‘¼å« handler æ¸¬è©¦æ¡ˆä¾‹**ï¼ˆ4 é … DB æ¢ä»¶å¼ï¼‰
* `GetAdoption`ï¼š`__tests__/test-getadoption-unit.test.js` å…§ **21 é …ç´” unit æ¸¬è©¦æ¡ˆä¾‹**ï¼ˆç„¡ SAMï¼Œç„¡å¯¦éš› DBï¼‰
* `PetInfoByPetNumber`ï¼š`__tests__/test-petinfobypetnumber.test.js` å…§ **13 é …ç›´æŽ¥å‘¼å« handler æ¸¬è©¦æ¡ˆä¾‹**ï¼ˆ3 é … DB æ¢ä»¶å¼ï¼‰
* ç¶œåˆç¸½è¨ˆï¼š**17 å€‹å·²é‡æ§‹ Lambda å…± 797 é … integration-style èˆ‡ direct-handler æ¸¬è©¦æ¡ˆä¾‹ + 15 é … SFExpressRoutes å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹ + 6 é … SMS service å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹ + 28 é … auth-workflow å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹ + 3 é … PetMedicalRecord aggregate å–®å…ƒæ¸¬è©¦**

ä»¥ä¸Šæ•¸å­—ç‚ºæ¸¬è©¦æª”ä¸­ã€Œå®£å‘Šçš„æ¡ˆä¾‹æ•¸ã€ï¼Œæœ¬èº«ä¸ç­‰åŒæ–¼åŒæ—¥å®Œæ•´åŸ·è¡Œç´€éŒ„ã€‚å·²å®Œæˆçš„å€‹åˆ¥æ¸¬è©¦çµæžœè«‹åƒè€ƒ `dev_docs/test_reports/` å…§å„ Lambda çš„æ¸¬è©¦å ±å‘Šã€‚

ç›®å‰å·²çŸ¥çš„å¯¦æ©Ÿé©—è­‰ä¹ŸåŒ…æ‹¬ `EmailVerification` çš„ Dev API Gateway æŠ½æ¨£æ¸¬è©¦ï¼š

* `POST /account/generate-email-code` å·²åœ¨ Dev API Gateway æˆåŠŸè§¸ç™¼ä¸¦é€é”çœŸå¯¦é©—è­‰éƒµä»¶
* `POST /account/verify-email-code` å·²åœ¨ Dev API Gateway æˆåŠŸå›žå‚³ JWT èˆ‡ refresh cookie åˆç´„æ¬„ä½

æ ¸å¿ƒå¸³æˆ¶é©—è­‰å¾ªç’°ç›®å‰å·²æ‹†åˆ†æˆ 3 å€‹æ›´æ¸…æ¥šçš„ Lambda è·è²¬ï¼š

* `UserRoutes` è² è²¬ **verification-first è¨»å†Š**ï¼ˆä¸€èˆ¬ä½¿ç”¨è€…ä¸ä½¿ç”¨å¯†ç¢¼ï¼‰ã€NGO auth èˆ‡å—ä¿è­·çš„å¸³æˆ¶æ“ä½œã€‚`POST /account/login`ã€`PUT /account/update-password`ã€`POST /account/login-2` ç‚ºå‡çµè·¯ç”±ï¼Œå›žå‚³ `405`
* `EmailVerification` è² è²¬å…¬é–‹çš„ Email èº«åˆ†è­‰æ˜Žæµç¨‹ï¼Œä½¿ç”¨ **3-branch verify**ï¼š(1) å·²èªè­‰ä½¿ç”¨è€… â†’ ç¶å®š email åˆ°å¸³è™Ÿï¼Œ(2) æ–°ä½¿ç”¨è€… â†’ `{ verified: true, isNewUser: true }`ï¼Œ(3) å·²è¨»å†Šä½¿ç”¨è€… â†’ è‡ªå‹•ç™»å…¥ä¸¦ç™¼è¡Œ token
* `AuthRoute` è² è²¬ refresh token è¼ªæ›¿èˆ‡çŸ­æ•ˆ access token æ›´æ–°

æ ¸å¿ƒé€²å±•æ˜¯å®‰å…¨æ€§åŠ å›ºã€‚é€™ä¸€éšŽæ®µçš„å·¥ä½œä¸¦éžå–®ç´”çš„ç¨‹å¼ç¢¼æ•´æ½”åŒ–ï¼Œè€Œæ˜¯åœ¨ 13 å€‹å·²é‡æ§‹çš„é«˜åƒ¹å€¼ Lambda ä»‹é¢ä¸Šï¼Œå¯¦è³ªé™ä½Žå·²çŸ¥å—æ”»æ“Šé¢¨éšªã€‚é€™äº›é¢¨éšªåŒ…å«æœªç¶“æŽˆæ¬Šçš„è³‡æ–™å­˜å–ã€å¸³æˆ¶æˆ–å¯µç‰©åˆªé™¤ã€å¸³è™Ÿå¥ªå–ã€æ•æ„Ÿè³‡æ–™å¤–æ´©ã€æš´åŠ›ç ´è§£ã€æ°´å¹³è¶Šæ¬Šèˆ‡æŽˆæ¬Šç¹žéŽã€‚

---

## æˆªè‡³ 2026-04-21 çš„ Monorepo ç¾æ³ (Status)

å°ˆæ¡ˆåˆæœŸè™•æ–¼ legacy ç‹€æ…‹ï¼ŒLambda ä¹‹é–“å­˜åœ¨å¤§é‡é‡è¤‡ helperã€æ··åˆ routing èˆ‡ business logic çš„å–®é«”æª”æ¡ˆï¼Œä»¥åŠé›£ä»¥å®‰å…¨æ¼”é€²çš„éš±æ€§åˆç´„ã€‚

ç›®å‰ç­–ç•¥ä¸æ˜¯ç«‹å³é€²è¡Œå…¨é¢ DDD é‡å¯«ï¼Œè€Œæ˜¯å—æŽ§çš„åŽŸä½ç¾ä»£åŒ– (in-situ modernization)ï¼šé€ä¸€ç©©å®šæ¯å€‹ Lambdaï¼Œä¿ç•™ç¾æœ‰ API åˆç´„ï¼ŒåŒæ™‚æå‡å®‰å…¨æ€§ã€å¯æ¸¬è©¦æ€§èˆ‡å¯ç¶­è­·æ€§ã€‚

ç›®å‰é€²åº¦ï¼š

* 17 å€‹æ¨¡çµ„åŒ–åƒè€ƒåŸºæº– Lambda
* ä¸€å¥—æ›¸é¢ç¾ä»£åŒ–æ¨™æº–
* ä¸€ä»½ä»¥è¡Œæ•¸èˆ‡é¢¨éšªç‚ºåŸºç¤Žçš„ Lambda ç›¤é»žæ¸…å–®
* å·²å®Œæˆç›®æ¨™å…·å‚™æ•´åˆæ¸¬è©¦æ”¯æ’
* å¯é‡è¤‡å¥—ç”¨åˆ°å‰©é¤˜ Lambda çš„é‡æ§‹æ¨¡å¼

ä¾æ“š `dev_docs/LAMBDA_REFACTOR_INVENTORY.md`ï¼Œç›®å‰æ­£å¼ç´å…¥é‡æ§‹çµ±è¨ˆç¯„åœçš„æ˜¯ **22 å€‹** Lambdaã€‚`adoption_website`ã€`AuthorizerRoute`ã€`TestIPLambda`ã€`WhatsappRoute` ç›®å‰åˆ—ç‚º out-of-planã€‚

åœ¨æ­¤çµ±è¨ˆå£å¾‘ä¸‹ï¼Œå·²æœ‰ **17 / 22** å®ŒæˆåŠ å›ºã€‚å‰©é¤˜ 5 å€‹ï¼ˆ`AIChatBot`ã€`GetBreed`ã€`LambdaProxyRoute`ã€`PublicRoutes`ã€`CreateFeedback`ï¼‰å·²ç”±ç®¡ç†å±¤æ¨™è¨»ç‚ºã€Œä¸éœ€è¦ã€ï¼Œåˆ—ç‚º out-of-scopeã€‚ç¬¬ä¸€éšŽæ®µåŽŸä½ç¾ä»£åŒ–è¨ˆç•«å› æ­¤**æ­£å¼å®Œæˆ**ã€‚

è‹¥ä»¥å·¥ä½œå€å…¨éƒ¨ function folder è¨ˆç®—ï¼Œç›®å‰å…±æœ‰ 26 å€‹ function foldersï¼›å…¶ä¸­ 4 å€‹åˆ»æ„æŽ’é™¤æ–¼ä¸»è¦é‡æ§‹è¨ˆåŠƒä¹‹å¤–ï¼Œå› æ­¤ä¸æ‡‰èˆ‡ä¸»é€²åº¦æ··ç®—ã€‚

---

## é‡æ§‹å¾Œçš„ Auth Flow

ç›®å‰å¸³æˆ¶ session ç”Ÿå‘½é€±æœŸå·²æ‹†åˆ†åˆ° 3 å€‹ Lambdaï¼Œè²¬ä»»é‚Šç•Œæ¯”èˆŠç³»çµ±æ¸…æ¥šï¼Œä¹Ÿæ¸›å°‘éš±æ€§å‰¯ä½œç”¨ã€‚

### 1. `UserRoutes` è² è²¬è¨»å†Šèˆ‡å—ä¿è­·å¸³æˆ¶æ“ä½œ

`UserRoutes` ç¾åœ¨æ˜¯ä¸»è¦å¸³æˆ¶å…¥å£ Lambdaã€‚å®ƒè™•ç† verification-first è¨»å†Šã€NGO è¨»å†Šï¼Œä»¥åŠå·²ç™»å…¥å¾Œçš„å¸³æˆ¶æ“ä½œã€‚

æœ€é‡è¦çš„è®Šæ›´æ˜¯ **verification-first flow**ï¼šä¸€èˆ¬ä½¿ç”¨è€…ä¸å†ä½¿ç”¨å¯†ç¢¼ã€‚

å°ä¸€èˆ¬ä½¿ç”¨è€…ä¾†èªªï¼š

* `POST /account/login` ç‚º**å‡çµè·¯ç”±**ï¼Œå›žå‚³ `405` â€” ä¸€èˆ¬ä½¿ç”¨è€…ä¸é€éŽå¸³å¯†ç™»å…¥
* `PUT /account/update-password` ç‚º**å‡çµè·¯ç”±**ï¼Œå›žå‚³ `405` â€” ä¸€èˆ¬ä½¿ç”¨è€…æ²’æœ‰å¯†ç¢¼
* `POST /account/login-2` ç‚º**å‡çµè·¯ç”±**ï¼Œå›žå‚³ `405`
* `POST /account/register` è¦æ±‚åœ¨ 10 åˆ†é˜çª—å£å…§æä¾›å·²æ¶ˆè€—çš„ email æˆ– SMS é©—è­‰ç¢¼
* è¨»å†ŠæˆåŠŸå›žå‚³ `{ userId, role, isVerified, token }` èˆ‡ `201` ç‹€æ…‹ç¢¼åŠ `HttpOnly` refresh cookie
* ä¸€èˆ¬ä½¿ç”¨è€…çš„å®Œæ•´é©—è­‰æµç¨‹ç‚ºï¼š**verify email/SMS â†’ å¸¶é©—è­‰è­‰æ˜Žè¨»å†Š â†’ ç²å¾— session**

å° NGO ä¾†èªªï¼š

* `POST /account/register-ngo` æœƒå»ºç«‹ NGO ä½¿ç”¨è€…ä¸Šä¸‹æ–‡ï¼Œä¸¦ç«‹å³ç™¼å‡º NGO sessionï¼ˆNGO ä»ä½¿ç”¨å¯†ç¢¼ï¼‰
* å¾ŒçºŒ NGO login æœƒå…ˆæª¢æŸ¥ç›®å‰ NGO approval ç‹€æ…‹ï¼Œæ‰æ±ºå®šæ˜¯å¦ç™¼å‡º session

ç”± `UserRoutes` æˆåŠŸå»ºç«‹ session æ™‚ï¼Œç›®å‰åˆç´„è¶¨æ–¼ä¸€è‡´ï¼š

* ä¸€å€‹çŸ­æ•ˆ Bearer JWT access token
* ä¸€å€‹ä»¥ `HttpOnly` cookie ä¿å­˜çš„ refresh token

### 2. `EmailVerification` è² è²¬ Email èº«åˆ†è­‰æ˜Žï¼ˆ3-Branch Verifyï¼‰

`EmailVerification` ç¾åœ¨å°ˆæ³¨æ–¼å…¬é–‹çš„ email code ç”¢ç”Ÿèˆ‡é©—è­‰ã€‚

å…¶ verify endpoint ä½¿ç”¨ **3-branch flow**ï¼š

* **Branch 1 â€” å·²èªè­‰ä½¿ç”¨è€…**ï¼ˆå¸¶ Bearer tokenï¼‰ï¼šå°‡å·²é©—è­‰çš„ email ç¶å®šåˆ°ç¾æœ‰å¸³è™Ÿ
* **Branch 2 â€” æ–°ä½¿ç”¨è€…**ï¼ˆè©² email ç„¡å°æ‡‰å¸³è™Ÿï¼‰ï¼šå›žå‚³ `{ verified: true, isNewUser: true }` è®“å‰ç«¯ç¹¼çºŒåˆ°è¨»å†Šæµç¨‹
* **Branch 3 â€” å·²è¨»å†Šä½¿ç”¨è€…**ï¼ˆå¸³è™Ÿå­˜åœ¨ä½†æœªèªè­‰ï¼‰ï¼šæ¨™è¨˜å¸³è™Ÿç‚º verified ä¸¦ç™¼å‡ºå®Œæ•´ sessionï¼ˆaccess token + refresh cookieï¼‰ä½œç‚ºè‡ªå‹•ç™»å…¥

ç›¸è¼ƒæ–¼èˆŠæµç¨‹ï¼Œå®ƒçš„è²¬ä»»æ›´çª„ä¹Ÿæ›´å®‰å…¨ï¼š

* generate ä¿æŒå…¬é–‹ï¼Œä¸¦å…·å‚™ anti-enumeration ä¿è­·
* verify ä»¥åŽŸå­æ–¹å¼æ¶ˆè€—é©—è­‰ç¢¼ï¼Œé¿å… replay
* verify ä¸æœƒå»ºç«‹æ–°çš„ user account
* é©—è­‰æˆåŠŸå¾Œï¼Œæ ¹æ“šèªè­‰ç‹€æ…‹èˆ‡å¸³è™Ÿå­˜åœ¨èˆ‡å¦è·¯ç”±åˆ°å°æ‡‰ branch

### 3. `AuthRoute` è² è²¬ Refresh Rotation èˆ‡ Renewal Policy

`AuthRoute` æ˜¯å°ˆé–€è™•ç† refresh token çš„ Lambdaã€‚å®ƒçš„å…¬é–‹è·¯ç”± `/auth/refresh` ä¸é  Bearer tokenï¼Œè€Œæ˜¯é  refresh-token cookie é©—è­‰ã€‚

refresh æµç¨‹æœƒï¼š

* å¾ž cookie è®€å– refresh token
* å°‡ token hash å¾Œæ¶ˆè€—å°æ‡‰çš„ refresh-token è¨˜éŒ„
* æ‹’çµ• missingã€malformedã€expired æˆ– replayed refresh token
* ç™¼å‡ºæ–°çš„çŸ­æ•ˆ access token
* é‡æ–°ç°½ç™¼ä¸¦è¼ªæ›¿ refresh cookie

å° NGO ä½¿ç”¨è€…ï¼Œrefresh é‚„æœƒä¿ç•™ `ngoId`ã€`ngoName` ç­‰ NGO claimsï¼Œä¸¦åœ¨ NGO ä¸å† approved æˆ– active æ™‚æ‹’çµ• refreshã€‚

---

## å®‰å…¨é¢¨éšªå¿«ç…§ (Security Risk Snapshot)

æ ¹æ“šå·²å®Œæˆ Lambda çš„å¯©è¨ˆèˆ‡ä¿®å¾©ï¼Œæœªé‡æ§‹çš„ legacy Lambda è‹¥ä»æœ‰ç›¸ä¼¼ coding patternï¼Œä»å¯èƒ½é¢è‡¨ä»¥ä¸‹æ”»æ“Šé¡žåˆ¥ï¼š

* broken authenticationï¼šå—ä¿è­·è·¯ç”±å¯åœ¨ç„¡æœ‰æ•ˆ JWT é©—è­‰ä¸‹è¨ªå•
* IDOR / horizontal privilege escalationï¼šé€éŽæ”¹ path param æˆ– body field è®€å¯«ä»–äººè³‡æ–™
* unauthorized deleteï¼šä»»æ„å¸³æˆ¶æˆ–å¯µç‰©è³‡æ–™åœ¨ç„¡ ownership check ä¸‹è¢«åˆªé™¤
* account takeoverï¼šä¸å®‰å…¨çš„ upsert-style registration æˆ– deprecated auth variant ç™¼å‡ºéŒ¯èª¤ token
* enumerationï¼šå…¬é–‹ç«¯é»žæ´©æ¼ä½¿ç”¨è€…ã€é›»è©±æˆ– entity æ˜¯å¦å­˜åœ¨
* brute-force / automation abuseï¼šloginã€registrationã€SMS æˆ– destructive routes ç¼ºä¹ rate limiting
* JWT tamperingï¼šéŽæœŸ token replayã€signature tamperingã€`alg:none` æ”»æ“Š
* mass assignmentï¼šå‘¼å«è€…å¯«å…¥ `role`ã€`deleted`ã€`owner`ã€`ngoId`ã€`tagId` ç­‰æ²»ç†æ¬„ä½
* sensitive data exposureï¼šåŽŸå§‹ DB document æ´©æ¼ password hashã€deleted flag æˆ–å…§éƒ¨ç‹€æ…‹
* NoSQL-style payload abuseï¼šoperator-like object é€²å…¥æœ¬æ‡‰åªæŽ¥å— scalar value çš„é‚è¼¯
* session persistence after deleteï¼šåˆªé™¤å¸³è™Ÿå¾Œ token æœªæ’¤éŠ·
* route confusionï¼šæ¨¡ç³Š `includes()` route matching é€²å…¥éŒ¯èª¤åˆ†æ”¯
* cross-origin exposureï¼šCORS éŽå¯¬æˆ–ä¸ä¸€è‡´
* raw error leakageï¼šå…§éƒ¨ exception æˆ– validation detail æ´©æ¼çµ¦å¤–éƒ¨

é€™äº›é¡žåˆ¥ä¸æ˜¯ç´”ç†è«–é¢¨éšªï¼Œè€Œæ˜¯å¾žå·²å¯©è¨ˆçš„ legacy Lambda pattern æŽ¨å°Žå‡ºçš„å¯¦éš›é¢¨éšªé¡žåž‹ã€‚å‰©é¤˜ Lambda æ˜¯å¦å—å½±éŸ¿ä»éœ€é€è·¯ç”±é©—è­‰ã€‚

---

## é‡æ§‹è¦†è“‹çŽ‡è©•ä¼°

### 1. å·²é‡æ§‹ Lambda çš„åŠ å›ºç¨‹åº¦

åœ¨å·²å®Œæˆçš„åƒè€ƒ Lambda ä¸­ï¼ŒåŠ å›ºè¦†è“‹çŽ‡ç›¸å°é«˜ï¼š

* `UserRoutes` è¨˜éŒ„ä¸¦è™•ç†äº† **19 é …** legacy security findingsã€‚Auth flow å·²å‡ç´šç‚º **verification-first**ï¼ˆä¸€èˆ¬ä½¿ç”¨è€…ç„¡å¯†ç¢¼ï¼Œlogin/password è·¯ç”±å‡çµè¿”å›ž 405ï¼‰
* `PetBasicInfo` è¨˜éŒ„ä¸¦è™•ç†äº† **13 é …**æ¶µè“‹ authã€ownershipã€destructive operationã€route matchingã€sanitization èˆ‡ error handling çš„ findings
* `EmailVerification` å®Œæˆå…¬é–‹é©—è­‰æµç¨‹é‡æ§‹ã€åš´æ ¼è¤‡å¯©ã€30/30 æ•´åˆæ¸¬è©¦èˆ‡éƒ¨ç½²å¾Œå¯¦æ©Ÿé©—è­‰
* `AuthRoute` å…·å‚™ 22-case suiteï¼Œè¦†è“‹ handler lifecycleã€public-resource bypassã€JWT middleware branchesã€NGO claim preservationã€NGO approval denialã€replay rejection èˆ‡ refresh rotation
* `GetAllPets` å…·å‚™ 53-case integration suiteï¼Œè¦†è“‹ public NGO listingã€JWT verificationã€self-accessã€ownership enforcementã€validationã€sanitization èˆ‡ mutation safety
* `PetLostandFound` å…·å‚™ 59/59 passing integration suiteï¼Œè¦†è“‹ pet-lost/pet-found CRUDã€notifications CRUDã€CORSã€JWT authã€guard validationã€self-access enforcementã€ownership-guarded deleteã€rate limiting èˆ‡ response shape
* `EyeUpload` å…·å‚™ 94/94 passing integration suiteï¼Œè¦†è“‹ CORSã€JWT authã€dead-route dispatchã€schema validationã€ownership enforcementã€NGO authorization branchesã€upload validationã€rate limiting èˆ‡ fixture-backed pet access checks
* `PetDetailInfo` å…·å‚™ 82/82 passing integration suiteï¼Œè¦†è“‹ CORSã€JWT authã€guard validationã€ownershipã€detail-infoã€transfer lifecycleã€NGO transferã€source/adoption lifecycleã€duplicate handlingã€response shapeã€NoSQL injection prevention èˆ‡ cleanup
* `PetMedicalRecord` å…·å‚™ 65/65 passing integration suiteï¼Œå¦æœ‰ 3/3 passing blood-test aggregate å–®å…ƒæ¸¬è©¦ï¼Œè¦†è“‹ CORSã€JWT authã€guard validationã€ownershipã€medical / medication / deworm / blood-test CRUDã€schema strictnessã€response sanitization èˆ‡ schema-bound hard-delete semantics
* `purchaseConfirmation` å…·å‚™ 65 declared (63/63 passing, 2 skipped) integration suiteï¼Œè¦†è“‹ CORSã€JWT authã€public-route bypassã€RBACã€guard validationã€dead-route dispatchã€Zod validation (purchase + email schemas)ã€NoSQL injectionã€admin paginationã€soft-cancel lifecycleã€server-authoritative pricingã€rate limiting èˆ‡ response shape consistency
* `SFExpressRoutes` å…·å‚™ 31-case integration suiteï¼ˆ26 é …é€šéŽï¼Œ5 é … live/DB æ¢ä»¶æ¸¬è©¦è·³éŽï¼‰ï¼Œå¦æœ‰ 15/15 passing å–®å…ƒæ¸¬è©¦ï¼Œè¦†è“‹ JWTã€CORSã€malformed bodyã€route safetyã€request validationã€rate limitingã€SF token retrievalã€ownership checkã€upstream SF failureã€cloud-waybill failure èˆ‡ email side-effect failure
* `OrderVerification` å…·å‚™ 39/39 passing SAM-local integration suiteï¼Œè¦†è“‹ JWTã€CORSã€guard validationã€admin/developer-only order listingã€DB-backed ownership checksã€supplier fallback lookupã€update persistenceã€sanitized outputã€duplicate orderId rejectionã€frozen DELETEã€WhatsApp non-dispatch fallback èˆ‡ structured handler failure logging
* `PetBiometricRoutes` å…·å‚™ 41-case SAM-local integration suiteï¼Œå…¶ä¸­æœ€æ–°åŸ·è¡Œæœ‰ 33 é …å¯¦éš›æ–·è¨€é€šéŽï¼Œå¦æœ‰ 8 é … business-database-dependent æ¸¬è©¦å› å¤–éƒ¨ business cluster é€£ç·šé™åˆ¶è€Œè¢«ç’°å¢ƒæ¢ä»¶å¼è·³éŽï¼›å·²è¦†è“‹ CORSã€JWT authã€exact-route `405`ã€guard validationã€DB-backed ownershipã€register create/update persistenceã€rate limitingï¼Œä»¥åŠåœ¨å¤–éƒ¨ business cluster é€£ç·šé»žä¹‹å‰çš„ verify contract
* `PetVaccineRecords` å…·å‚™ **34 / 34 passing** SAM-local integration suiteï¼Œè¦†è“‹ CORSã€JWT authï¼ˆå« `alg:none` èˆ‡ tampered-signature åˆ†æ”¯ï¼‰ã€owner/NGO/stranger æŽˆæ¬ŠåŸ·è¡Œã€cross-pet scope éš”é›¢ï¼ˆé€éŽéŒ¯èª¤ `petId` å®šå€ vaccine record å›žå‚³ `404`ï¼‰ã€body æ¬„ä½ NoSQL injection é˜²è­·ã€`ACTIVE_VACCINE_FILTER` è»Ÿåˆªé™¤åŸ·è¡Œã€CRUD lifecycleï¼ˆcreateã€updateã€deleteã€impossible-date æ‹’çµ•ï¼‰ï¼Œä»¥åŠ fixture-gated æŽˆæ¬Šè¦†è“‹
* `CreatePetBasicInfo` å…·å‚™ **18 / 18 passing** ç›´æŽ¥å‘¼å« handler æ¸¬è©¦å¥—ä»¶ï¼Œè¦†è“‹ CORSã€JWT authã€guard validationã€method enforcementã€Zod schema `superRefine` æœªçŸ¥æ¬„ä½æ‹’çµ•ï¼ˆbody ä¸­çš„ `userId` èˆ‡ `ngoId` å‡è¢«æ‹’çµ•ï¼‰ã€NoSQL injection é˜²è­·ã€rate-limiting è¡Œç‚ºï¼ˆç„¡æ•ˆ JSON ä¸å¢žåŠ è¨ˆæ•¸å™¨ï¼‰ã€server-side `userId` å¾ž JWT æ³¨å…¥ã€response æ¬„ä½ sanitizationï¼Œä»¥åŠé‡è¤‡ `tagId` `409` è™•ç†
* `GetAdoption` å…·å‚™ **21 / 21 passing** ç´” unit æ¸¬è©¦å¥—ä»¶ï¼ˆç„¡ SAMï¼Œç„¡å¯¦éš› DBï¼‰ï¼Œè¦†è“‹ CORS allowlistã€guard validationï¼ˆinvalid ObjectIdã€page ç¯„åœã€search é•·åº¦ã€filter æ­£è¦åŒ–ï¼‰ã€method enforcementã€å…¬é–‹è·¯ç”±æ˜Žç¢ºé©—è­‰ï¼ˆç¢ºèª `authJWT` å¾žä¸åœ¨ adoption ç«¯é»žä¸Šè¢«å‘¼å«ï¼‰ã€`getAdoptionList` serviceï¼ˆæˆåŠŸè·¯å¾‘ã€empty-result `maxPage: 0`ã€åˆ†é ï¼‰ï¼Œä»¥åŠ `getAdoptionById` serviceï¼ˆ`404`ã€detail payload shape å« adoption-website å¿…è¦æ¬„ä½ï¼‰
* `PetInfoByPetNumber` å…·å‚™ **13 / 13 passing** ç›´æŽ¥å‘¼å« handler æ¸¬è©¦å¥—ä»¶ï¼Œè¦†è“‹ CORSã€guard validationï¼ˆmissing/blank/over-length `tagId`ï¼‰ã€method enforcementã€DB-backed tag lookupï¼ˆæ‰¾åˆ°å¯µç‰©æ™‚å›žå‚³ sanitized å…¬é–‹æ¬„ä½ï¼‰ã€missing-tag anti-enumerationï¼ˆå›žå‚³ `200` + all-null form è€Œéž `404`ï¼‰ã€è»Ÿåˆªé™¤å¯µç‰© anti-enumerationï¼Œä»¥åŠå…§éƒ¨æ¬„ä½æŠ‘åˆ¶ï¼ˆ`userId`ã€`ngoId`ã€`ngoPetId`ã€owner contactsã€visibility flagsï¼‰ã€‚æ­¤æ¸¬è©¦éšŽæ®µç™¼ç¾ä¸¦ä¿®å¾© `functions/PetInfoByPetNumber/src/utils/sanitize.js` çš„ null guard bug

åˆä½µä¾†çœ‹ï¼Œå‰ 2 å€‹å®Œæˆå¯©è¨ˆçš„ Lambda ç›´æŽ¥è™•ç†äº† **32 é … documented legacy security findings**ï¼Œå¦å¤– `EmailVerification`ã€`AuthRoute`ã€`GetAllPets`ã€`PetLostandFound`ã€`EyeUpload`ã€`PetDetailInfo`ã€`PetMedicalRecord`ã€`purchaseConfirmation`ã€`SFExpressRoutes`ã€`OrderVerification`ã€`PetBiometricRoutes`ã€`PetVaccineRecords`ã€`CreatePetBasicInfo`ã€`GetAdoption`ã€`PetInfoByPetNumber` ä¹Ÿå·²å®Œæˆåš´æ ¼ç¾ä»£åŒ–èˆ‡æ¸¬è©¦æ”¯æ’çš„å®‰å…¨åŠ å›ºã€‚

æ›´æº–ç¢ºçš„èªªæ³•æ˜¯å®šæ€§è©•ä¼°ï¼Œè€Œä¸æ˜¯å®£ç¨±å›ºå®šç™¾åˆ†æ¯”ï¼šå·²å®Œæˆçš„ 17 å€‹ Lambda åœ¨å…¶è‡ªèº« route surface ä¸Šï¼Œå·²å¤§å¹…é™ä½Žå·²çŸ¥ code-owned attack classesã€‚

### 2. æ•´é«” Monorepo çš„è¦†è“‹ç¨‹åº¦

åœ¨æ•´å€‹ monorepo å±¤ç´šï¼Œç¾ä»£åŒ–å·²é€²å…¥å¾ŒæœŸä½†å°šæœªå®Œæˆï¼š

* inventory in-plan ç›®å‰ **17 / 22** å·²å®Œæˆ
* ç´„ **77%** çš„ in-plan Lambda å·²é”æ–°æ¨™æº–
* ç´„ **23%** ä»éœ€é€²è¡Œç›¸åŒ route-by-route security verification èˆ‡ refactor discipline
* å¦æœ‰ **4 å€‹** workspace Lambdas ç›®å‰åˆ—ç‚º out-of-plan

æ­£ç¢ºè§£è®€æ˜¯ï¼šå·²å®Œæˆçš„ 17 å€‹ Lambda å…§ï¼Œå¤§éƒ¨åˆ†å·²çŸ¥ code-owned attack classes å·²è¢«è™•ç†ã€‚å‰©é¤˜ 5 å€‹ in-plan Lambda å·²ç”±ç®¡ç†å±¤æ¨™è¨»ç‚ºã€Œä¸éœ€è¦ã€ï¼Œä¸åˆ—å…¥æœ¬è¨ˆç•«ç¯„åœã€‚ç¬¬ä¸€éšŽæ®µåŽŸä½ç¾ä»£åŒ–è¨ˆç•«æ­£å¼å®Œæˆã€‚

---

## å·²å®Œæˆåƒè€ƒ Lambda çš„æ ¸å¿ƒæ”¹é€²

### 1. å®‰å…¨æ¼æ´žä¿®è£œ

å·²å®Œæˆçš„ refactor é—œé–‰äº†è¨˜éŒ„åœ¨å„ Lambda `SECURITY.md` èˆ‡ test report ä¸­çš„å…·é«”é¢¨éšªã€‚å¯¦éš›æ•ˆæžœæ˜¯è®“é€™äº›åƒè€ƒ Lambda æ›´é›£è¢«å¸¸è¦‹ API attack path åˆ©ç”¨ï¼ŒåŒ…æ‹¬ broken authã€ownership bypassã€mass assignmentã€route confusionã€brute-force abuseã€enumeration èˆ‡ sensitive data leakageã€‚

`PetDetailInfo` çš„åŠ å›ºé …ç›®åŒ…å«ï¼š

* 13 æ¢ active routes å…¨éƒ¨å— JWT ä¿è­·ï¼Œ`PUBLIC_RESOURCES = []`
* detail-infoã€transferã€sourceã€adoption route å…¨éƒ¨ä½¿ç”¨ DB-backed ownership enforcement
* NGO transfer åœ¨ guard layer åŸ·è¡Œ NGO RBAC
* target user lookup ä½¿ç”¨ anti-enumeration neutral error
* email/phone å¿…é ˆ cross-validate åˆ°åŒä¸€å€‹ target user `_id`
* DD/MM/YYYYã€YYYY-MM-DDã€ISO timestamp åŸ·è¡Œ calendar-strict validation
* source/adoption create ä½¿ç”¨ `checkDuplicates()` ä¸¦è¿”å›ž `409`
* Pet write predicate åŒ…å« `deleted:false`
* transfer update/delete åŒ…å« embedded transfer id predicate èˆ‡ matched-count verification
* source/adoption update/delete ä½¿ç”¨ `_id + petId` write scoping
* response ä½¿ç”¨ projection èˆ‡ sanitizerï¼Œé¿å… raw document leakage

`SFExpressRoutes` çš„åŠ å›ºé …ç›®åŒ…å«ï¼š

* å¾ž 600 è¡Œç´š legacy handler æ‹†åˆ†ç‚º handlerã€routerã€middlewareã€configã€serviceã€utilsã€schemaã€modelã€locale æ¨¡çµ„
* create-orderã€cloud-waybill printã€address tokenã€areaã€netCodeã€pickup-location route å…¨éƒ¨ä½¿ç”¨ exact route dispatch
* active routes å…¨éƒ¨å— JWT ä¿è­·ï¼ŒJWT bypass åƒ…é™éž production
* create-order åœ¨å¯«å…¥ waybill åˆ°æ—¢æœ‰ order æ™‚åŸ·è¡Œ DB-backed tempId ownership check
* tokenã€metadataã€create-orderã€cloud-waybill route å…·å‚™ per-action rate limiting
* æ‰€æœ‰ request body ä½¿ç”¨ Zod validation èˆ‡ç©©å®š `sfExpress.*` error keys
* SF address API key æ”¹ç‚ºç’°å¢ƒè®Šæ•¸ï¼Œaddress-service call ä½¿ç”¨ HTTPS
* å–®å…ƒæ¸¬è©¦è¦†è“‹ upstream SF API failureã€malformed payloadã€missing waybillã€missing print fileã€email side-effect failure

`OrderVerification` çš„åŠ å›ºé …ç›®åŒ…å«ï¼š

* å¾ž 580 è¡Œç´š legacy handler æ‹†åˆ†ç‚º handlerã€routerã€middlewareã€configã€serviceã€utilsã€schemaã€modelã€locale æ¨¡çµ„
* supplierã€ordersInfoã€WhatsApp-linkã€admin listã€tag read/updateã€frozen DELETE route å…¨éƒ¨ä½¿ç”¨ exact route dispatch
* active routes å…¨éƒ¨å— JWT ä¿è­·ï¼Œsupplier/ordersInfo/WhatsApp-link access ä½¿ç”¨ DB-backed ownership checks
* `GET /v2/orderVerification/getAllOrders` åƒ…å…è¨± admin/developer
* tag update èˆ‡ supplier update ä½¿ç”¨ schema-backed validationï¼Œè¦†è“‹ invalid dateã€invalid pendingStatusã€empty multipart
* ä½¿ç”¨ allowlisted projections èˆ‡ sanitizerï¼Œé¿å… `discountProof` ç­‰æ•æ„Ÿæ¬„ä½å¤–æ´©
* duplicate `orderId` update å›žå‚³ `409`
* WhatsApp tracking dispatch èˆ‡ DB update éš”é›¢ï¼Œprovider failure ä¸å›žæ»¾æˆåŠŸæ›´æ–°
* SAM-local integration tests è¦†è“‹ ownershipã€persistenceã€sanitized outputã€CORSã€JWTã€route freezingã€handler failure logging

é€™äº›å®‰å…¨ä¿®å¾©å·²ç”±ä»¥ä¸‹æ¸¬è©¦å ±å‘Šæ”¯æ’ï¼š

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

### 2. æ€§èƒ½æ”¹å–„ (Performance)

å·²å®Œæˆ refactor å¸¶ä¾†å¯¦ç”¨çš„ Lambda runtime æ”¹å–„ï¼š

* thin `index.js` entrypoints é™ä½Žå…¥å£æª”è² æ“”
* lazy route loading é¿å…æ¯æ¬¡ invocation è¼‰å…¥ç„¡é—œæœå‹™
* singleton MongoDB connection reuse é¿å…é‡è¤‡é€£ç·šæˆæœ¬
* è¼ƒå°çš„ MongoDB pool sizing æ¸›å°‘ Lambda å´é€£ç·šæµªè²»
* malformed requests ææ—©æ‹’çµ•ï¼Œé¿å…ä¸å¿…è¦ DB work
* `.lean()` reads èˆ‡ focused projections æ¸›å°‘ Mongoose èˆ‡ payload overhead

### 3. å¯ç¶­è­·æ€§ (Maintainability)

å·²å®Œæˆ Lambda ç›®å‰éµå¾ªä¸€è‡´ç”Ÿå‘½é€±æœŸï¼š

* handler orchestration
* CORS preflight
* JWT auth
* guard validation
* DB bootstrap
* ownership / self-access / role checks
* exact router dispatch
* service execution
* centralized response building

é€™è®“å·¥ç¨‹å¸«åœ¨ä¸åŒ Lambda é–“æœ‰å¯é æœŸçš„æª”æ¡ˆçµæ§‹èˆ‡è²¬ä»»é‚Šç•Œï¼Œé™ä½Žä¿®æ”¹å–®ä¸€è·¯ç”±æ™‚é€ æˆéžé æœŸ regression çš„é¢¨éšªã€‚

### 4. æ“´å±•æ€§èˆ‡ç©©å®šæ€§ (Scalability & Stability)

ç›®å‰çš„ refactor æ”¹å–„åŒ…æ‹¬ï¼š

* å»ºç«‹å¯é‡è¤‡å¥—ç”¨çš„ Lambda shape
* standardized validationã€responseã€loggingã€authã€CORSã€DB reuse pattern
* route-level logic æ›´å®¹æ˜“æ“´å……ï¼Œä¸å†è†¨è„¹å–®ä¸€ god file
* çµæ§‹åŒ–éŒ¯èª¤å›žæ‡‰è®“ frontendã€æ¸¬è©¦èˆ‡ LLM automation æ›´ç©©å®š
* SAM local + MongoDB integration tests è¦†è“‹çœŸå¯¦ request path

---

## ç‚ºä»€éº¼å…ˆé¸æ“‡åŽŸä½ç¾ä»£åŒ–

ç›®å‰ç­–ç•¥æ˜¯åœ¨ä¸é€²è¡Œå¤§è¦æ¨¡ DDD é‡å¯«çš„æƒ…æ³ä¸‹ï¼Œé€ä¸€ç¾ä»£åŒ– Lambdaã€‚é€™æ˜¯æ­¤ legacy monorepo ç›®å‰æœ€å‹™å¯¦çš„åšæ³•ï¼Œå› ç‚ºå®ƒèƒ½ï¼š

* é€ä¸€æ›¿æ›ï¼Œé¿å… big-bang rewrite
* é¿å…åœæ©Ÿæˆ–å¤§è¦æ¨¡ service migration
* é¿å…ç ´å£žå‰ç«¯æ—¢æœ‰ API contract
* ç«‹å³é™ä½Ž securityã€validationã€observabilityã€maintainability é¢¨éšª
* ç‚ºæœªä¾†æ›´æ·±å…¥çš„æž¶æ§‹èª¿æ•´å»ºç«‹å®‰å…¨åŸºç·š

å¦‚æžœå¤ªæ—©é€²è¡Œå…¨é¢ DDD redesignï¼Œåœ˜éšŠæœƒåŒæ™‚é¢å° legacy ambiguityã€hidden contract dependenciesã€domain decompositionã€migration strategy èˆ‡ regression preventionï¼Œé¢¨éšªæœƒè¢«æ”¾å¤§ã€‚

ç›®å‰åšæ³•å…ˆè®“ Lambda å¯ç†è§£ã€å¯æ¸¬è©¦ã€å¯å®‰å…¨ä¿®æ”¹ã€‚å®Œæˆé€™å€‹éšŽæ®µå¾Œï¼Œæœªä¾† deeper DDD re-architecture æ‰æ›´ç¾å¯¦ã€‚

---

## çµèªž

æˆªè‡³ 2026-04-21ï¼ŒMonorepo é‡æ§‹å·¥ä½œå·²ç”¢å‡º 13 å€‹å¯ä½œç‚ºåŸºæº–çš„åƒè€ƒå¯¦ä½œï¼Œä¸¦ç´¯ç© **711 é … integration-style æ¸¬è©¦æ¡ˆä¾‹ + 15 é … SFExpressRoutes å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹ + 6 é … SMS service å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹ + 28 é … auth-workflow å–®å…ƒæ¸¬è©¦æ¡ˆä¾‹ + 3 é … PetMedicalRecord aggregate å–®å…ƒæ¸¬è©¦**ï¼ˆä¾ `__tests__` æ¸¬è©¦æª”çµ±è¨ˆï¼‰ã€‚

å·²å®Œæˆ refactor é¡¯ç¤ºå‡ºæ˜Žç¢ºæ”¹å–„ï¼š

* å®‰å…¨æ€§
* æ€§èƒ½
* å¯ç¶­è­·æ€§
* æ“´å±•æ€§
* ç©©å®šæ€§

é€™ä¸æ˜¯æœ€çµ‚æž¶æ§‹ï¼Œä½†å®ƒæ˜¯é€šå¾€æœ€çµ‚æž¶æ§‹å‰å¿…è¦ä¸”æ­£ç¢ºçš„åŸºç¤Žã€‚å¦‚æžœç›®æ¨™æ˜¯åœ¨æŒçºŒäº¤ä»˜çš„åŒæ™‚ä¿è­·æ¥­å‹™ï¼Œé€™ä»½ 2026-04-21 å ±å‘Šæ‡‰è¢«è¦–ç‚ºæ—©æœŸå®‰å…¨é¢¨éšªé€€å ´èˆ‡å·¥ç¨‹è¤‡åˆ©ç´¯ç©ï¼Œè€Œéž cosmetic refactoringã€‚

---

## é™„éŒ„ï¼ˆ2026-04-22ï¼‰â€” èªžç³»èˆ‡ errorKey æ¨™æº–åŒ–

åœ¨å®Œæˆå„ Lambda çš„é¦–è¼ªé‡æ§‹å¾Œï¼Œæ•´å€‹ monorepo é‡å° `errorKey` èˆ‡èªžç³»æª”é€²è¡Œäº†å…¨é¢æ¨™æº–åŒ–ï¼Œæ¶µè“‹ 17 å€‹å·²é‡æ§‹çš„ Lambda ä»¥åŠ `purchaseConfirmation`ã€‚é€™æ¬¡æ•´åˆç‚ºæ‰€æœ‰ API éŒ¯èª¤èˆ‡æˆåŠŸè¨Šæ¯å»ºç«‹äº†çµ±ä¸€ã€å¯è¢«æ©Ÿå™¨è®€å–çš„æ ¼å¼ã€‚

### å•é¡Œ

æ¨™æº–åŒ–å‰ï¼Œæ¯å€‹ Lambda çš„ `locales/*.json` å„è‡ªç‚ºæ”¿ï¼š

* æœ‰äº›ä½¿ç”¨æ‰å¹³éµåï¼ˆä¾‹å¦‚ `"unauthorized"`ã€`"invalidJSON"`ã€`"petNotFound"`ï¼‰ã€‚
* æœ‰äº›ä½¿ç”¨ä¸€å±¤é»žè¨˜æ³•ï¼ˆä¾‹å¦‚ `"phoneRegister.userExist"`ã€`"verification.codeExpired"`ï¼‰ã€‚
* æœ‰äº›ä½¿ç”¨ `others.*` å‘½åç©ºé–“æ··åˆç‰¹å®šç¶²åŸŸè‘‰ç¯€é»žï¼ˆä¾‹å¦‚ `"others.unauthorized"`ã€`"updateImage.invalidUserId"`ï¼‰ã€‚
* `unauthorized`ã€`internalError`ã€`invalidJSON` ç­‰è·¨åˆ‡é¢çš„éŒ¯èª¤éµå€¼æ¯å€‹ Lambda å„è‡ªé‡è¤‡å®šç¾©ï¼Œæ²’æœ‰å–®ä¸€äº‹å¯¦ä¾†æºã€‚
* è‹±æ–‡èˆ‡ä¸­æ–‡æª”ç¶“å¸¸æ¼‚ç§» â€” å…¶ä¸­ä¸€å€‹èªžç³»å­˜åœ¨çš„éµï¼Œå¦ä¸€å€‹èªžç³»å»æ²’æœ‰ã€‚

å¾Œæžœï¼šå‰ç«¯èˆ‡æ¸¬è©¦ç¨‹å¼ç¢¼å¿…é ˆç¡¬ç¶ Lambda-specific çš„éµæ ¼å¼ã€CloudWatch éŽæ¿¾å™¨ä¾è³´ä¸ä¸€è‡´çš„åˆ†é¡žæ³•ï¼Œæ–°å¢žéŒ¯èª¤è¨Šæ¯æ™‚å¿…é ˆçŒœæ¸¬æ‡‰è©²æ”¾é€²å“ªå€‹å‘½åç©ºé–“ã€‚

### çµ±ä¸€æ ¼å¼ï¼ˆç¾å·²å¼·åˆ¶åŸ·è¡Œï¼‰

æ¯å€‹ Lambda çš„æ¯å€‹ `locales/<lang>.json` çš†éµå¾ªï¼š

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

* `common.<leaf>` â€” æ‰€æœ‰ Lambda è‡ªå…±ç”¨åŸºæº–é‡æ–°åŒ¯å‡ºçš„è·¨åˆ‡é¢éµã€‚
* `<lambdaDomainCamel>.errors.<leaf>` â€” ç‰¹å®šç«¯é»žçš„éŒ¯èª¤è¨Šæ¯ã€‚
* `<lambdaDomainCamel>.success.<leaf>` â€” ç‰¹å®šç«¯é»žçš„æˆåŠŸè¨Šæ¯ã€‚

`<lambdaDomainCamel>` ç‚º Lambda è³‡æ–™å¤¾åç¨±çš„ camelCase å½¢å¼ï¼š

| Lambda è³‡æ–™å¤¾ | Domain å‰ç¶´ |
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

ç•¶ç¶²åŸŸæœ¬èº«æœ‰å­è³‡æºæ™‚ï¼Œå…è¨±åœ¨ `<domain>.errors` / `<domain>.success` ä¸‹å†åˆ†çµ„ â€” ä¾‹å¦‚ `petDetailInfo.errors.petAdoption.invalidDateFormat`ã€`petMedicalRecord.errors.bloodTest.notFound` æˆ– `userRoutes.errors.verification.codeExpired`ã€‚

### å·¥å…·åˆç´„

* `utils/response.js::createErrorResponse(statusCode, errorKey, event)` å›žå‚³ `{ success: false, errorKey, error, requestId }`ï¼Œå…¶ä¸­ `errorKey` ç‚ºæ¨™æº–é»žè¨˜æ³•è·¯å¾‘ã€‚
* `utils/response.js::createSuccessResponse(statusCode, event, data)` å›žå‚³ `{ success: true, message, ...data }`ï¼Œå…¶ä¸­ `message` ç”±åŒä¸€æ¨™æº–è·¯å¾‘è§£æžå¾—åˆ°ã€‚
* `utils/i18n.js::getTranslation(dict, "domain.group.leaf")` èµ°è¨ªèªžç³» JSON æ¨¹ï¼Œé‡åˆ°ç¼ºéµæ™‚å„ªé›…å›žé€€ã€‚

`errorKey` åœ¨æ‰€æœ‰èªžç³»ä¸‹çš†ä¿æŒç©©å®š â€” å‰ç«¯èˆ‡æ¸¬è©¦æ‡‰ä»¥ `errorKey` ä½œç‚ºåˆ†æ”¯ä¾æ“šï¼Œçµ•ä¸æ‡‰ä½¿ç”¨ `error`ï¼ˆæœ¬åœ°åŒ–äººé¡žå¯è®€æ–‡å­—ï¼‰ã€‚

### é·ç§»æˆæžœ

* è·¨ `functions/**`ã€`shared/**`ã€`__tests__/**` å…±ä¿®æ”¹ **217 å€‹æª”æ¡ˆ**ã€‚
* å·®ç•°é‡ **+2,281 / âˆ’2,355 è¡Œ** â€” æ·¨æ¸›å°‘ï¼Œå› ç‚ºåŽŸæœ¬æ¯å€‹ Lambda é‡è¤‡çš„è·¨åˆ‡é¢æ‰å¹³éµï¼Œå·²æ”¶æ–‚ç‚ºå…±äº«çš„ `common.*` å€å¡Šã€‚
* å° `sam local start-api` å•Ÿå‹•çš„æœ¬æ©Ÿ API è·‘å®Œå…¨éƒ¨ 20 å€‹ Jest å¥—ä»¶ï¼ˆ5 å€‹å–®å…ƒæ¸¬è©¦ + 15 å€‹æ•´åˆæ¸¬è©¦ï¼‰çš†é€šéŽã€‚
* åœ¨é©—è­‰éŽç¨‹ä¸­ç™¼ç¾ä¸¦ä¿®å¾©å…©å€‹ç”±é·ç§»å¼•å…¥çš„ bugï¼š
  1. `functions/PetDetailInfo/src/middleware/ownership.js` å¼•ç”¨äº†å…ˆå‰é‡å¯«æ™‚éºç•™çš„æœªå®šç¾©è­˜åˆ¥å­— `callerNgoId`ï¼Œå·²æ›¿æ›ç‚º `event.ngoId`ï¼Œæ¢å¾© `PetDetailInfo` çš„ 82 ç­†æ¸¬è©¦æ¡ˆä¾‹ã€‚
  2. `__tests__/test-sms-service.test.js` å° `verifySmsCode` çš„æ–°ç”¨æˆ¶èˆ‡å·²é©—è­‰ç”¨æˆ¶æµç¨‹ä»ç„¶ä½¿ç”¨èˆŠæœŸæœ›ï¼›å·²æ›´æ–°ä»¥å°é½Šç›®å‰çš„æœå‹™è¡Œç‚ºï¼ˆæ¯æ¬¡æˆåŠŸé©—è­‰éƒ½æœƒ upsert `SmsVerificationCode`ï¼›å°šæœªé€£çµåˆ°å¸³æˆ¶çš„é›»è©±è™Ÿç¢¼æœƒå›žå‚³ `isNewUser: true`ï¼‰ã€‚
* `__tests__/test-petmedicalrecord.test.js` èˆ‡ `__tests__/test-petvaccinerecords.test.js` æœ‰å…©å€‹ç”¨ä¾‹ä»æœŸæœ›å…±äº« pet-id é©—è­‰éŒ¯èª¤ä½¿ç”¨èˆŠçš„ `petDetailInfo.errors.*` å‰ç¶´ï¼›å·²æ›´æ–°ç‚ºå„è‡ª Lambda çš„å‰ç¶´ã€‚

### æ–‡ä»¶é€£éŽ–æ›´æ–°ï¼ˆ2026-04-22ï¼‰

åŒä¸€æ³¢æ›´æ–°ä¸­ï¼Œ`dev_docs/api_docs/` ä¸‹æ‰€æœ‰ API åƒè€ƒæ–‡ä»¶çš†å·²æ”¹å¼•ç”¨æ–°çš„æ¨™æº– `errorKey`ï¼š

* `dev_docs/api_docs/README.md` ç¾å·²è¨˜éŒ„ `common.*` / `<domain>.errors.*` / `<domain>.success.*` æ ¼å¼ä¸¦åˆ—å‡ºæ‰€æœ‰è·¨åˆ‡é¢ `common.*` éµã€‚
* `ACCOUNT_API.md`ã€`AUTH_FLOW_API.md`ã€`MEDIA_UPLOAD_API.md`ã€`NGO_ADMIN_API.md`ã€`PET_ADOPTION_API.md`ã€`PET_BIOMETRICS_API.md`ã€`PET_DETAIL_INFO_API.md`ã€`PET_HEALTH_API.md`ã€`PET_LOST_FOUND_API.md`ã€`PET_PROFILE_API.md`ã€`PURCHASE_ORDER_API.md` èˆ‡ `SF_EXPRESS_API.md` è£¡æ¯å€‹ç«¯é»žçš„éŒ¯èª¤è¡¨éƒ½å·²é‡å¯«ï¼Œç¢ºä¿åˆ—å‡ºçš„æ¯å€‹ `errorKey` éƒ½åŽŸæ¨£å­˜åœ¨æ–¼å°æ‡‰ Lambda çš„ `locales/en.json`ã€‚

### ç‚ºä»€éº¼é€™ä»¶äº‹é‡è¦

* **å‰ç«¯çš„ç¢ºå®šæ€§ã€‚** `unauthorized`ã€`internalError`ã€`rateLimited` ç­‰éŒ¯èª¤ç¾åœ¨æœ‰å–®ä¸€ç©©å®šéµï¼Œå‰ç«¯åªéœ€å¯¦ä½œä¸€å€‹å…¨åŸŸæ””æˆªå™¨ï¼Œè€Œä¸ç”¨ç‚ºæ¯å€‹ API å®¢è£½åŒ–ã€‚
* **æ¸¬è©¦è¡›ç”Ÿã€‚** æ•´åˆæ–·è¨€èˆ‡ Lambda å¯¦éš›è¼¸å‡ºçš„éµå®Œå…¨å°é½Šï¼Œä»»ä½•æœå‹™å±¤å›žæ­¸éƒ½æœƒç«‹åˆ»åœ¨å°æ‡‰çš„æ¸¬è©¦å¥—ä»¶è£¡æ›å…‰ã€‚
* **å¯è§€æ¸¬æ€§ã€‚** CloudWatch çš„ `errorKey` éŽæ¿¾å™¨ç¾å·²ä¸€è‡´ â€” ä¸€å€‹ `errorKey=common.internalError` éŽæ¿¾å™¨å°±èƒ½æŠ“åˆ°æ‰€æœ‰ Lambda çš„ 500ã€‚
* **i18n å°±ç·’ã€‚** æ–°å¢žèªžç³»åªæ˜¯ç¿»è­¯æ—¢æœ‰è‘‰ç¯€é»žï¼Œä¸éœ€è¦å‰µé€ æ–°çš„éµè·¯å¾‘ã€‚
* **è²¢ç»è€…é˜»åŠ›ã€‚** æ–°å¢žéŒ¯èª¤åªéœ€åœ¨å…©å€‹èªžç³»æª”åŠ å…©è¡Œï¼Œä¸¦åœ¨ `createErrorResponse` å‘¼å«è™•å¼•ç”¨ â€” ä¸å†æ˜¯è¨­è¨ˆæ±ºç­–ã€‚
