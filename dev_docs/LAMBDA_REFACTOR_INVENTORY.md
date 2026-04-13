# Lambda Refactor Inventory

This inventory uses `index.js` or `index.mjs` line count as a rough proxy for how much structural separation a Lambda likely needs.

It is not a perfect measure. Final priority should still consider route count, auth risk, query complexity, and how often the Lambda changes.

## Summary

- Total Lambda entry files checked: 25
- Already modularized with `src/handler.js`: 3
- Remaining Lambdas needing review: 22
- Clear full-separation candidates: 8
- Medium-size Lambdas that likely need partial separation: 6
- Smaller Lambdas that should usually stay simple: 8

## Already Refactored

These already match the stronger handler-based pattern.

| Lambda | Entry file | Lines | Status |
| --- | --- | ---: | --- |
| `UserRoutes` | `index.js` | 4 | already modularized |
| `PetBasicInfo` | `index.js` | 4 | already modularized |
| `EmailVerification` | `index.js` | 4 | already modularized |

## Full Separation Recommended

These are large enough that the full UserRoutes or PetBasicInfo style separation is likely worth the effort.

Suggested target shape:

- thin `index.js`
- `src/handler.js`
- `src/router.js` when multi-route
- middleware, services, utils, config split where it reduces risk

| Priority | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| 1 | `PetLostandFound` | `index.js` | 1089 | strong candidate for full modular split |
| 2 | `EyeUpload` | `index.js` | 1041 | strong candidate for full modular split |
| 3 | `PetDetailInfo` | `index.js` | 991 | strong candidate for full modular split |
| 4 | `purchaseConfirmation` | `index.js` | 897 | strong candidate for full modular split |
| 5 | `PetMedicalRecord` | `index.js` | 784 | strong candidate for full modular split |
| 6 | `SFExpressRoutes` | `index.js` | 603 | strong candidate for full modular split |
| 7 | `OrderVerification` | `index.js` | 582 | strong candidate for full modular split |
| 8 | `PetBiometricRoutes` | `index.js` | 511 | strong candidate for full modular split |

## Partial Separation Recommended

These are medium-size Lambdas. They should usually get a lighter version of the pattern rather than a full heavyweight split.

Suggested target shape:

- thin entrypoint
- cleaner orchestration flow
- standardized validation, response, DB reuse, auth, and logging
- router or service split only if route count or branching justifies it

| Priority Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| medium | `GetAllPets` | `index.js` | 416 | use pragmatic split, not necessarily full UserRoutes pattern |
| medium | `AIChatBot` | `index.js` | 359 | partial separation likely enough unless logic is more coupled than size suggests |
| medium | `PetVaccineRecords` | `index.js` | 326 | partial separation likely enough |
| medium | `AuthRoute` | `index.js` | 323 | partial separation likely enough |
| medium | `CreatePetBasicInfo` | `index.js` | 282 | partial separation likely enough |
| medium | `GetBreed` | `index.js` | 272 | partial separation likely enough |

## Keep Simple Unless Risk Proves Otherwise

These are smaller Lambdas. They should still meet the refactor checklist for validation, logging, auth, CORS, DB reuse, and SAM testing, but they do not automatically need the full UserRoutes structure.

| Size Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| small | `LambdaProxyRoute` | `index.js` | 210 | keep simple unless control flow is unusually messy |
| small | `GetAdoption` | `index.js` | 195 | keep simple unless auth or branching is riskier than expected |
| small | `PetInfoByPetNumber` | `index.js` | 134 | keep simple |
| small | `PublicRoutes` | `index.js` | 117 | keep simple |
| small | `CreateFeedback` | `index.js` | 106 | keep simple |
| small | `TestIPLambda` | `index.js` | 50 | keep simple |
| small | `AuthorizerRoute` | `index.js` | 31 | keep simple |
| small | `WhatsappRoute` | `index.mjs` | 8 | keep simple |

## Full Inventory

| Lambda | Entry file | Lines | Has `src/handler.js` | Current recommendation |
| --- | --- | ---: | --- | --- |
| `PetLostandFound` | `index.js` | 1089 | no | full separation |
| `EyeUpload` | `index.js` | 1041 | no | full separation |
| `PetDetailInfo` | `index.js` | 991 | no | full separation |
| `purchaseConfirmation` | `index.js` | 897 | no | full separation |
| `PetMedicalRecord` | `index.js` | 784 | no | full separation |
| `SFExpressRoutes` | `index.js` | 603 | no | full separation |
| `OrderVerification` | `index.js` | 582 | no | full separation |
| `EmailVerification` | `index.js` | 4 | yes | already modularized |
| `PetBiometricRoutes` | `index.js` | 511 | no | full separation |
| `GetAllPets` | `index.js` | 416 | no | partial separation |
| `AIChatBot` | `index.js` | 359 | no | partial separation |
| `PetVaccineRecords` | `index.js` | 326 | no | partial separation |
| `AuthRoute` | `index.js` | 323 | no | partial separation |
| `CreatePetBasicInfo` | `index.js` | 282 | no | partial separation |
| `GetBreed` | `index.js` | 272 | no | partial separation |
| `LambdaProxyRoute` | `index.js` | 210 | no | keep simple unless risk says otherwise |
| `GetAdoption` | `index.js` | 195 | no | keep simple unless risk says otherwise |
| `PetInfoByPetNumber` | `index.js` | 134 | no | keep simple |
| `PublicRoutes` | `index.js` | 117 | no | keep simple |
| `CreateFeedback` | `index.js` | 106 | no | keep simple |
| `TestIPLambda` | `index.js` | 50 | no | keep simple |
| `AuthorizerRoute` | `index.js` | 31 | no | keep simple |
| `WhatsappRoute` | `index.mjs` | 8 | no | keep simple |
| `PetBasicInfo` | `index.js` | 4 | yes | already modularized |
| `UserRoutes` | `index.js` | 4 | yes | already modularized |

## Suggested Working Order

If the goal is to reduce structural risk quickly, the best next candidates are:

1. `PetLostandFound`
2. `EyeUpload`
3. `PetDetailInfo`
4. `PetMedicalRecord`
5. `OrderVerification`

These appear to have the highest structural payoff by size alone.

## Notes

- This inventory only uses entry-file size and presence of `src/handler.js`.
- A small Lambda can still be high risk if it has dangerous auth, weak validation, or costly queries.
- A medium Lambda does not automatically need the full UserRoutes file layout.
- Use `REFACTOR_CHECKLIST.md` as the actual done-standard.
