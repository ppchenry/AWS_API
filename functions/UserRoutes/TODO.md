# TODO for Wednesday

- [x] Create middleware for guarding the Lambda (authentication/authorization checks)
<!-- - [ ] Figure out the correct paths in routing based on the AWS API Gateway `resource` (see console) -->
- [ ] No more v2 endpoints
- [ ] clean up services from co worker
- [x] Remove normalizeResource(), use "{HTTP Method} {event.resouce}" like "GET /pet/{petID}/basic-info" for routing
- [x] Check all service handlers and modify as needed for clean code, performance, and security
- [ ] Write events for UserRoutes to enable SAM CLI API testing
- [x] Use Zod to validate request body fields for all endpoints
<!-- - [ ] standardized http status in response.js (userroutes and petbasicinfo) -->
- [x] env check at the start of lambda at config/...
- [x] standardize authJWT
- [ ] body userid and ngoid check
- [ ] fix /pet-list-ngo first !!!!