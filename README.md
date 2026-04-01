# Lambda Monorepo

This repository is the starting point for consolidating a legacy set of AWS Lambda functions into a single maintainable monorepo.

The current codebase works, but it is inconsistent, repetitive, and difficult to evolve safely. Several functions contain duplicated helpers, repeated connection logic, repeated CORS and auth handling, and large handler files that mix routing, validation, data access, and business logic in the same place.

This README documents the current project structure and the refactoring direction for turning this codebase into something sustainable.

## Current Goal

The immediate goal is not to preserve the current shape forever.

The goal is to restructure this repository into a clean monorepo where:

- each Lambda owns a clear domain boundary
- duplicated code is extracted into `shared/`
- large god functions are broken into smaller modules
- business logic is separated from transport, validation, and persistence concerns
- future engineers can understand and change the code without tracing thousands of lines in one file

## Refactoring Direction

This monorepo will be incrementally restructured around a few basic engineering principles.

### 1. Separation of Concerns

Handler files should stop doing everything.

Over time, each function should move toward a structure where responsibilities are split across focused modules, for example:

- route and event parsing
- authentication and authorization
- request validation
- domain services
- data access and repository logic
- response formatting

### 2. DRY

Repeated logic across functions should be removed.

Common code such as the following should be extracted into `shared/` when it is stable and truly reusable:

- MongoDB connection helpers
- CORS utilities
- JWT and auth helpers
- response builders
- validation helpers
- shared constants and configuration
- common integration clients

### 3. Smaller, Testable Units

Several existing Lambda handlers are effectively 1000 to 2000 line god functions. Those will be decomposed into smaller modules with clear inputs and outputs so the code becomes easier to test, review, and debug.

### 4. Monorepo Consistency

The repository will move toward consistent conventions for:

- folder structure
- naming
- shared utilities
- environment management
- linting and testing
- deployment workflows

## Tech Stack

- Node.js
- AWS Lambda
- Amazon API Gateway
- MongoDB
- Amazon S3
- Zod
- GitHub

## Project Structure

```text
.
|-- functions/
|   |-- adoption_website/
|   |-- AIChatBot/
|   |-- AuthorizerRoute/
|   |-- AuthRoute/
|   |-- CreateFeedback/
|   |-- CreatePetBasicInfo/
|   |-- EmailVerification/
|   |-- EyeUpload/
|   |-- GetAdoption/
|   |-- GetAllPets/
|   |-- GetBreed/
|   |-- LambdaProxyRoute/
|   |-- OrderVerification/
|   |-- PetBasicInfo/
|   |-- PetBiometricRoutes/
|   |-- PetDetailInfo/
|   |-- PetInfoByPetNumber/
|   |-- PetLostandFound/
|   |-- PetMedicalRecord/
|   |-- PetVaccineRecords/
|   |-- PublicRoutes/
|   |-- purchaseConfirmation/
|   |-- SFExpressRoutes/
|   |-- TestIPLambda/
|   |-- UserRoutes/
|   `-- WhatsappRoute/
|-- shared/
|-- .env.example
`-- README.md
```

## Functions Overview

| Function | Responsibility |
| --- | --- |
| `adoption_website` | Adoption website application and supporting web flow. |
| `AIChatBot` | AI chat, OCR, and document processing workflows. |
| `AuthorizerRoute` | Custom authorization for protected API routes. |
| `AuthRoute` | Authentication and token lifecycle logic. |
| `CreateFeedback` | Feedback creation and rating submission. |
| `CreatePetBasicInfo` | Initial pet record creation. |
| `EmailVerification` | Verification and email-driven identity flows. |
| `EyeUpload` | Eye image upload and related analysis logging. |
| `GetAdoption` | Public adoption listing and detail retrieval. |
| `GetAllPets` | Pet list retrieval for account flows. |
| `GetBreed` | Animal, breed, product, and reference data retrieval. |
| `LambdaProxyRoute` | Proxy entrypoint for environment-based upstream routing. |
| `OrderVerification` | Order verification and supplier-related flows. |
| `PetBasicInfo` | Core pet profile reads and updates. |
| `PetBiometricRoutes` | Pet biometric and matching workflows. |
| `PetDetailInfo` | Extended pet details and source/adoption metadata. |
| `PetInfoByPetNumber` | Pet lookup by tag or pet number. |
| `PetLostandFound` | Lost-and-found reporting and matching support. |
| `PetMedicalRecord` | Medical records, medications, deworming, and blood test data. |
| `PetVaccineRecords` | Vaccine history management. |
| `PublicRoutes` | Public and partner-facing API routes. |
| `purchaseConfirmation` | Purchase confirmation and order-related post-processing. |
| `SFExpressRoutes` | SF Express logistics integration. |
| `TestIPLambda` | Network and outbound IP verification utility. |
| `UserRoutes` | User management and access-related flows. |
| `WhatsappRoute` | WhatsApp-related messaging placeholder or integration entrypoint. |

## Shared Folder Strategy

`shared/` will become the home for cross-cutting code that should not be reimplemented in every Lambda.

Planned candidates include:

- database connection utilities
- auth middleware and token helpers
- CORS and HTTP response helpers
- schema-level validation helpers
- logging utilities
- AWS client wrappers
- external service adapters

The rule is simple: if the same logic appears in multiple functions, it should be reviewed for extraction into `shared/`.

## What Will Change

As this repository is cleaned up, expect the following changes:

- large handlers split into smaller files
- duplicated code removed
- shared logic centralized
- naming normalized across functions
- clearer boundaries between controller, service, and data layers
- improved readability and maintainability

This is an active restructuring effort, not a finished architecture.

## Engineering Standard

This repository will be refactored with a bias toward maintainability over short-term convenience.

That means:

- no new duplicated utility code
- no new god functions
- no mixing unrelated concerns in one file when the code can be separated cleanly
- no copy-paste fixes when a shared abstraction is the right answer

The target state is a monorepo that is easier to reason about, easier to onboard into, and safer to extend.
