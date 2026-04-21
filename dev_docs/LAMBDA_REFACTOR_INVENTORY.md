# Lambda Refactor Inventory

This inventory uses the Lambda entrypoint line count and the presence of `src/handler.js` as a rough proxy for how much structural separation a Lambda likely needs.

It is not a perfect measure. Final priority should still consider route count, auth risk, query complexity, external integrations, and how often the Lambda changes.

## Summary

- Total in-plan Lambda entry files checked: 22
- Already modularized with `src/handler.js`: 12
- Remaining Lambdas needing review: 10
- Clear full-separation candidates: 1
- Medium-size Lambdas that likely need partial separation: 4
- Smaller Lambdas that should usually stay simple: 5

## AWS Lambda Dev Deployment Status

Modularized status does not mean the Lambda has already been deployed to the AWS Lambda Dev server for Postman testing.

Only the following refactored Lambdas have been deployed on the AWS Lambda Dev server for Postman testing so far:

- `UserRoutes`
- `GetAllPets`
- `PetBasicInfo`
- `EmailVerification`
- `AuthRoute`
- `EyeUpload`

All other modularized Lambdas in this inventory still require AWS Lambda Dev deployment and Postman verification before they should be considered deployment-validated.

## Already Refactored

These already match the stronger handler-based pattern.

| Lambda | Entry file | Lines | Status |
| --- | --- | ---: | --- |
| `UserRoutes` | `index.js` | 6 | already modularized |
| `PetBasicInfo` | `index.js` | 5 | already modularized |
| `EmailVerification` | `index.js` | 5 | already modularized |
| `AuthRoute` | `index.js` | 3 | already modularized |
| `GetAllPets` | `index.js` | 3 | already modularized |
| `PetLostandFound` | `index.js` | 5 | already modularized |
| `EyeUpload` | `index.js` | 5 | already modularized |
| `PetDetailInfo` | `index.js` | 5 | already modularized |
| `PetMedicalRecord` | `index.js` | 5 | already modularized |
| `purchaseConfirmation` | `index.js` | 2 | already modularized |
| `SFExpressRoutes` | `index.js` | 3 | already modularized |
| `OrderVerification` | `index.js` | 4 | already modularized |

## Full Separation Recommended

This Lambda is large enough that the full UserRoutes or PetBasicInfo style separation is likely worth the effort.

Suggested target shape:

- thin `index.js`
- `src/handler.js`
- `src/router.js` when multi-route
- middleware, services, utils, config split where it reduces risk

| Priority | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| 1 | `PetBiometricRoutes` | `index.js` | 546 | strong candidate for full modular split |

## Partial Separation Recommended

These are medium-size Lambdas. They should usually get a lighter version of the pattern rather than a full heavyweight split.

Suggested target shape:

- thin entrypoint
- cleaner orchestration flow
- standardized validation, response, DB reuse, auth, and logging
- router or service split only if route count or branching justifies it

| Priority Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| 1 medium | `AIChatBot` | `index.js` | 399 | partial separation likely enough unless logic is more coupled than size suggests |
| 2 medium | `PetVaccineRecords` | `index.js` | 373 | partial separation likely enough |
| 3 medium | `CreatePetBasicInfo` | `index.js` | 317 | partial separation likely enough |
| 4 medium | `GetBreed` | `index.js` | 301 | partial separation likely enough |

## Keep Simple Unless Risk Proves Otherwise

These are smaller Lambdas. They should still meet the refactor checklist for validation, logging, auth, CORS, DB reuse, and SAM testing, but they do not automatically need the full UserRoutes structure.

| Size Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | ---: | --- |
| 1 small | `LambdaProxyRoute` | `index.js` | 248 | keep simple unless control flow is unusually messy |
| 2 small | `GetAdoption` | `index.js` | 220 | keep simple unless auth or branching is riskier than expected |
| 3 small | `PetInfoByPetNumber` | `index.js` | 153 | keep simple |
| 4 small | `PublicRoutes` | `index.js` | 133 | keep simple |
| 5 small | `CreateFeedback` | `index.js` | 119 | keep simple |

## Full Inventory

| Lambda | Entry file | Lines | Has `src/handler.js` | Current recommendation |
| --- | --- | ---: | --- | --- |
| `UserRoutes` | `index.js` | 6 | yes | already modularized |
| `PetBasicInfo` | `index.js` | 5 | yes | already modularized |
| `EmailVerification` | `index.js` | 5 | yes | already modularized |
| `AuthRoute` | `index.js` | 3 | yes | already modularized |
| `GetAllPets` | `index.js` | 3 | yes | already modularized |
| `PetLostandFound` | `index.js` | 5 | yes | already modularized |
| `EyeUpload` | `index.js` | 5 | yes | already modularized |
| `PetDetailInfo` | `index.js` | 5 | yes | already modularized |
| `PetMedicalRecord` | `index.js` | 5 | yes | already modularized |
| `purchaseConfirmation` | `index.js` | 2 | yes | already modularized |
| `SFExpressRoutes` | `index.js` | 3 | yes | already modularized |
| `OrderVerification` | `index.js` | 4 | yes | already modularized |
| `PetBiometricRoutes` | `index.js` | 546 | no | full separation |
| `AIChatBot` | `index.js` | 399 | no | partial separation |
| `PetVaccineRecords` | `index.js` | 373 | no | partial separation |
| `CreatePetBasicInfo` | `index.js` | 317 | no | partial separation |
| `GetBreed` | `index.js` | 301 | no | partial separation |
| `LambdaProxyRoute` | `index.js` | 248 | no | keep simple unless risk says otherwise |
| `GetAdoption` | `index.js` | 220 | no | keep simple unless risk says otherwise |
| `PetInfoByPetNumber` | `index.js` | 153 | no | keep simple |
| `PublicRoutes` | `index.js` | 133 | no | keep simple |
| `CreateFeedback` | `index.js` | 119 | no | keep simple |

## Not in Refactoring Plan

1. `adoption_website`: not a Lambda
2. `AuthorizerRoute`: not required in the refactored auth cycle
3. `TestIPLambda`: internal testing Lambda
4. `WhatsappRoute`: hello-world placeholder

## Suggested Working Order

If the goal is to reduce structural risk quickly, the best next candidates are:

1. `PetBiometricRoutes`
2. `AIChatBot`
3. `PetVaccineRecords`
4. `CreatePetBasicInfo`
5. `GetBreed`

`SFExpressRoutes` and `OrderVerification` were previously the top full-separation candidates. They are now moved to the completed modularized group.

## Notes

- This inventory only uses entry-file size and presence of `src/handler.js`.
- A small Lambda can still be high risk if it has dangerous auth, weak validation, or costly queries.
- A medium Lambda does not automatically need the full UserRoutes file layout.
- Use `REFACTOR_CHECKLIST.md` as the actual done-standard.
