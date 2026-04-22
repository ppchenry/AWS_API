# Lambda Refactor Inventory

This inventory uses the Lambda entrypoint line count and the presence of `src/handler.js` as a rough proxy for how much structural separation a Lambda likely needs.

It is not a perfect measure. Final priority should still consider route count, auth risk, query complexity, external integrations, and how often the Lambda changes.

## Summary

- Total in-plan Lambda entry files checked: 22
- Already modularized with `src/handler.js`: 17
- Remaining Lambdas needing review: 5 (all marked out-of-scope by manager)
- Clear full-separation candidates: 0
- Medium-size Lambdas marked not required: 2
- Smaller Lambdas marked not required: 3

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
| `PetBiometricRoutes` | `index.js` | 3 | already modularized |
| `PetVaccineRecords` | `index.js` | 3 | already modularized |
| `CreatePetBasicInfo` | `index.js` | 3 | already modularized |
| `GetAdoption` | `index.js` | 3 | already modularized |
| `PetInfoByPetNumber` | `index.js` | 3 | already modularized |

## Partial Separation Recommended

These are medium-size Lambdas. They should usually get a lighter version of the pattern rather than a full heavyweight split.

Suggested target shape:

- thin entrypoint
- cleaner orchestration flow
- standardized validation, response, DB reuse, auth, and logging
- router or service split only if route count or branching justifies it

| Priority Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | --- | ---: | --- |
| x medium — not required | `AIChatBot` | `index.js` | 399 | not required by manager |
| x medium — not required | `GetBreed` | `index.js` | 301 | not required by manager |

## Keep Simple Unless Risk Proves Otherwise

These are smaller Lambdas. They should still meet the refactor checklist for validation, logging, auth, CORS, DB reuse, and SAM testing, but they do not automatically need the full UserRoutes structure.

| Size Tier | Lambda | Entry file | Lines | Recommendation |
| --- | --- | ---: | --- |
| x small — not required | `LambdaProxyRoute` | `index.js` | 248 | not required by manager |
| x small — not required | `PublicRoutes` | `index.js` | 133 | not required by manager |
| x small — not required | `CreateFeedback` | `index.js` | 119 | not required by manager |

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
| `PetBiometricRoutes` | `index.js` | 3 | yes | already modularized |
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

## Notes

- This inventory only uses entry-file size and presence of `src/handler.js`.
- A small Lambda can still be high risk if it has dangerous auth, weak validation, or costly queries.
- A medium Lambda does not automatically need the full UserRoutes file layout.
- Use `REFACTOR_CHECKLIST.md` as the actual done-standard.
