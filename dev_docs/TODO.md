- [ ] add location param to ngo pet list query

- [ ] audit PetVaccineRecords changes against security checklist and deployment validation requirements
- [ ] audit CreatePetBasicInfo changes against security checklist and partial-separation target
- [ ] audit GetAdoption changes and confirm whether keep-simple structure is still sufficient
- [ ] audit PetInfoByPetNumber changes against keep-simple checklist and auth/validation baseline

- [ ] standardize all locale keys
- [ ] optimize test cases for PetVaccineRecords, CreatePetBasicInfo, GetAdoption, and PetInfoByPetNumber
- [ ] deploy all refactored lambdas onto dev and run Postman verification for each deployed route set

- [ ] debug the depraceted routes 401 vs 405 issues