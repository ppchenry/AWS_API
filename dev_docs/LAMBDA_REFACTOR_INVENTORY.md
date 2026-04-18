# Lambda Refactor Inventory

This inventory uses `index.js` or `index.mjs` line count as a rough proxy for how much structural separation a Lambda likely needs.

It is not a perfect measure. Final priority should still consider route count, auth risk, query complexity, and how often the Lambda changes.

## Summary

- Total Lambda entry files checked: 22
- Already modularized with `src/handler.js`: 9
- Remaining Lambdas needing review: 13
- Clear full-separation candidates: 4
- Medium-size Lambdas that likely need partial separation: 4
- Smaller Lambdas that should usually stay simple: 5

## Already Refactored

These already match the stronger handler-based pattern.

| Lambda | Entry file | Lines | Status |
| --- | --- | ---: | --- |
| `UserRoutes` | `index.js` | 4 | already modularized |
| `PetBasicInfo` | `index.js` | 4 | already modularized |
| `EmailVerification` | `index.js` | 4 | already modularized |
| `AuthRoute` | `index.js` | 4 | already modularized |
| `GetAllPets` | `index.js` | 5 | already modularized |
| `PetLostandFound` | `index.js` | 4 | already modularized |
| `EyeUpload` | `index.js` | 4 | already modularized |
| `PetDetailInfo` | `index.js` | 4 | already modularized |
| `purchaseConfirmation` | `index.js` | 2 | already modularized |

## Full Separation Recommended

These are large enough that the full UserRoutes or PetBasicInfo style separation is likely worth the effort.

Suggested target shape:

- thin `index.js`
- `src/handler.js`
- `src/router.js` when multi-route
- middleware, services, utils, config split where it reduces risk

| Priority | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| 1 | `PetMedicalRecord` | `index.js` | 784 | strong candidate for full modular split |
| 2 | `SFExpressRoutes` | `index.js` | 603 | strong candidate for full modular split |
| 3 | `OrderVerification` | `index.js` | 582 | strong candidate for full modular split |
| 4 | `PetBiometricRoutes` | `index.js` | 511 | strong candidate for full modular split |

## Partial Separation Recommended

These are medium-size Lambdas. They should usually get a lighter version of the pattern rather than a full heavyweight split.

Suggested target shape:

- thin entrypoint
- cleaner orchestration flow
- standardized validation, response, DB reuse, auth, and logging
- router or service split only if route count or branching justifies it

| Priority Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
|x medium | `AIChatBot` | `index.js` | 359 | partial separation likely enough unless logic is more coupled than size suggests |
|2 medium | `PetVaccineRecords` | `index.js` | 326 | partial separation likely enough |
|1 medium | `CreatePetBasicInfo` | `index.js` | 282 | partial separation likely enough |
|x medium | `GetBreed` | `index.js` | 272 | partial separation likely enough |

## Keep Simple Unless Risk Proves Otherwise

These are smaller Lambdas. They should still meet the refactor checklist for validation, logging, auth, CORS, DB reuse, and SAM testing, but they do not automatically need the full UserRoutes structure.

| Size Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| 6 small | `LambdaProxyRoute` | `index.js` | 210 | keep simple unless control flow is unusually messy |
| 5 small | `GetAdoption` | `index.js` | 195 | keep simple unless auth or branching is riskier than expected |
| 4 small | `PetInfoByPetNumber` | `index.js` | 134 | keep simple |
| x small | `PublicRoutes` | `index.js` | 117 | keep simple |
| x small | `CreateFeedback` | `index.js` | 106 | keep simple |

## Full Inventory

| Lambda | Entry file | Lines | Has `src/handler.js` | Current recommendation |
| --- | --- | ---: | --- | --- |
| `PetLostandFound` | `index.js` | 4 | yes | already modularized |
| `EyeUpload` | `index.js` | 4 | yes | already modularized |
| `PetDetailInfo` | `index.js` | 4 | yes | already modularized |
| `purchaseConfirmation` | `index.js` | 2 | yes | already modularized |
| `PetMedicalRecord` | `index.js` | 784 | no | full separation |
| `SFExpressRoutes` | `index.js` | 603 | no | full separation |
| `OrderVerification` | `index.js` | 582 | no | full separation |
| `EmailVerification` | `index.js` | 4 | yes | already modularized |
| `PetBiometricRoutes` | `index.js` | 511 | no | full separation |
| `GetAllPets` | `index.js` | 5 | yes | already modularized |
| `AIChatBot` | `index.js` | 359 | no | partial separation |
| `PetVaccineRecords` | `index.js` | 326 | no | partial separation |
| `AuthRoute` | `index.js` | 4 | yes | already modularized |
| `CreatePetBasicInfo` | `index.js` | 282 | no | partial separation |
| `GetBreed` | `index.js` | 272 | no | partial separation |
| `LambdaProxyRoute` | `index.js` | 210 | no | keep simple unless risk says otherwise |
| `GetAdoption` | `index.js` | 195 | no | keep simple unless risk says otherwise |
| `PetInfoByPetNumber` | `index.js` | 134 | no | keep simple |
| `PublicRoutes` | `index.js` | 117 | no | keep simple |
| `CreateFeedback` | `index.js` | 106 | no | keep simple |
| `PetBasicInfo` | `index.js` | 4 | yes | already modularized |
| `UserRoutes` | `index.js` | 4 | yes | already modularized |

## Not in Refactoring Plan

1. adoption_website: Not lambda
2. AuthorizerRoute: Don't required in refactored auth cycle
3. TestIPLambda: Internal testing lambda
4. WhatsappRoute: hello world file

## Suggested Working Order

If the goal is to reduce structural risk quickly, the best next candidates are:

1. `PetMedicalRecord`
2. `OrderVerification`
3. `SFExpressRoutes`
4. `PetBiometricRoutes`

These appear to have the highest structural payoff by size alone.

## Notes

- This inventory only uses entry-file size and presence of `src/handler.js`.
- A small Lambda can still be high risk if it has dangerous auth, weak validation, or costly queries.
- A medium Lambda does not automatically need the full UserRoutes file layout.
- Use `REFACTOR_CHECKLIST.md` as the actual done-standard.
