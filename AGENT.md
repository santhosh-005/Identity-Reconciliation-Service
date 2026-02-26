# AGENT.md — Identity Reconciliation Service

## Project Overview

A production-grade backend service that reconciles customer identities across multiple purchases on FluxKart.com. The service links contacts sharing common `email` or `phoneNumber` values, maintaining a primary/secondary hierarchy, and exposes a single `/identify` POST endpoint for contact consolidation.

---

## Architecture Decisions (Global)

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict mode) | Type safety, spec requirement |
| Runtime | Node.js 18+ | LTS, native ESM support |
| Framework | Express | Spec requirement, lightweight |
| Validation | Zod | Schema-first validation, great TS inference |
| Database | PostgreSQL | Production-grade relational DB, free tier on Render/Neon |
| ORM | Prisma | Type-safe queries, migrations, schema-first design |
| Config | dotenv | Spec requirement, 12-factor app |
| CORS | cors | Spec requirement |
| Testing | Jest + ts-jest | Spec requirement (last priority) |
| Linting | ESLint + Prettier | Code consistency |

---

## Phase 1 — Project Scaffolding & Configuration

### Objective
Set up a professional TypeScript + Express project structure with all tooling configured and ready for development.

### Technical Decisions
- Use `tsx` for development (fast TS execution, no build step during dev)
- Use `tsc` for production build to `dist/`
- Strict TypeScript config (`strict: true`, `noUncheckedIndexedAccess: true`)
- Use ES module-style imports with CommonJS output (for broadest compatibility)
- Environment variables: `PORT`, `DATABASE_URL`, `NODE_ENV`

### Tasks
- [ ] Install dependencies: `express`, `cors`, `dotenv`, `zod`, `prisma`, `@prisma/client`
- [ ] Install dev dependencies: `typescript`, `tsx`, `@types/express`, `@types/cors`, `@types/node`, `eslint`, `prettier`, `jest`, `ts-jest`, `@types/jest`
- [ ] Create `tsconfig.json` with strict settings
- [ ] Create `.env` and `.env.example` with `PORT`, `DATABASE_URL`, `NODE_ENV`
- [ ] Create `.gitignore` (node_modules, dist, .env, prisma/*.db)
- [ ] Set up project folder structure:
  ```
  src/
  ├── index.ts              # Entry point — server bootstrap
  ├── app.ts                # Express app setup (middleware, routes)
  ├── config/
  │   └── env.ts            # Zod-validated environment config
  ├── routes/
  │   └── identify.route.ts # POST /identify route
  ├── controllers/
  │   └── identify.controller.ts
  ├── services/
  │   └── contact.service.ts   # Core business logic
  ├── repositories/
  │   └── contact.repository.ts # DB access layer (Prisma)
  ├── schemas/
  │   └── identify.schema.ts   # Zod request/response schemas
  ├── middlewares/
  │   ├── error-handler.ts     # Global error handler
  │   └── validate.ts          # Zod validation middleware
  ├── utils/
  │   └── app-error.ts         # Custom error class
  └── types/
      └── contact.types.ts     # Shared type definitions
  prisma/
  └── schema.prisma
  ```
- [ ] Configure `package.json` scripts: `dev`, `build`, `start`, `lint`, `format`, `db:migrate`, `db:generate`
- [ ] Verify `npm run dev` starts the server on configured PORT

### Acceptance Criteria
- `npm run dev` starts an Express server that responds to `GET /health` with `{ status: "ok" }`
- TypeScript compiles with zero errors in strict mode
- Environment variables are validated at startup via Zod — invalid config crashes immediately with clear error messages
- Folder structure matches the specification above

---

## Phase 2 — Database Schema & Prisma Setup

### Objective
Define the `Contact` model in Prisma matching the spec, run migrations, and implement the repository layer.

### Technical Decisions
- Use Prisma's `@@index` for composite indexes on `email` and `phoneNumber` to optimize lookups
- Soft-delete via `deletedAt` field (nullable DateTime)
- `linkPrecedence` modeled as a Prisma enum (`PRIMARY`, `SECONDARY`)
- Repository pattern isolates all Prisma calls — service layer never imports `@prisma/client` directly
- Singleton Prisma client instantiation with graceful shutdown

### Tasks
- [ ] Define `Contact` model in `prisma/schema.prisma`:
  ```prisma
  model Contact {
    id              Int       @id @default(autoincrement())
    phoneNumber     String?
    email           String?
    linkedId        Int?
    linkPrecedence  LinkPrecedence
    createdAt       DateTime  @default(now())
    updatedAt       DateTime  @updatedAt
    deletedAt       DateTime?

    linkedContact   Contact?  @relation("ContactLink", fields: [linkedId], references: [id])
    secondaryContacts Contact[] @relation("ContactLink")

    @@index([email])
    @@index([phoneNumber])
    @@index([linkedId])
  }

  enum LinkPrecedence {
    primary
    secondary
  }
  ```
- [ ] Create Prisma client singleton (`src/config/prisma.ts`)
- [ ] Run initial migration: `npx prisma migrate dev --name init`
- [ ] Implement `contact.repository.ts` with methods:
  - `findByEmailOrPhone(email?, phoneNumber?)` — find all contacts matching either field
  - `findById(id)` — single contact lookup
  - `findAllLinkedContacts(primaryId)` — all secondary contacts of a primary
  - `create(data)` — insert new contact
  - `updateToPrimary / updateToSecondary(id, linkedId)` — change precedence
  - `update(id, data)` — generic update
- [ ] Verify migration succeeds and Prisma Client generates with correct types

### Acceptance Criteria
- `npx prisma migrate dev` runs successfully and creates the Contact table
- Prisma Client auto-generates with full type safety for the Contact model
- Repository methods compile and are ready for service layer integration
- Database indexes exist on `email`, `phoneNumber`, and `linkedId`

---

## Phase 3 — Core Business Logic (Service Layer)

### Objective
Implement the identity reconciliation algorithm in `contact.service.ts` — the heart of the application.

### Technical Decisions
- All reconciliation logic lives in the service layer; controller and repository remain thin
- Use database transactions for operations that mutate multiple rows (primary→secondary conversion)
- The algorithm must handle these four cases:
  1. **No match** — create new primary contact
  2. **Exact match** — return existing consolidated contact (no new row)
  3. **Partial match (new info)** — create secondary contact linked to primary
  4. **Two separate primaries linked** — older stays primary, newer (+ its secondaries) become secondary

### Tasks
- [ ] Implement `identifyContact(email?, phoneNumber?)` in `contact.service.ts`:
  - Step 1: Query all contacts matching the given email OR phoneNumber
  - Step 2: If no matches → create a new primary contact, return response
  - Step 3: Resolve the primary contact(s) — walk `linkedId` chains to find root primaries
  - Step 4: If two distinct primaries found → merge: older stays primary, newer becomes secondary (update `linkedId`, `linkPrecedence`, `updatedAt`). Also re-link all secondaries of the newer primary to the older primary.
  - Step 5: If new information exists (email or phone not yet in the linked set) → create a secondary contact
  - Step 6: Gather all contacts in the linked group → build consolidated response
- [ ] Implement `buildConsolidatedResponse(primaryContact, allContacts)`:
  - `primaryContactId`: the primary's ID
  - `emails`: deduplicated, primary's email first
  - `phoneNumbers`: deduplicated, primary's phone first
  - `secondaryContactIds`: all secondary contact IDs
- [ ] Edge cases to handle:
  - Request with only email (no phone)
  - Request with only phone (no email)
  - Request where both email AND phone are null/empty → return 400
  - Exact duplicate request (same email + phone already exists) → no new row created
  - Deep linking chains (secondary of secondary — should not happen by design, but guard against it)

### Acceptance Criteria
- Case 1 (no match): Creates a new primary contact, returns it with empty `secondaryContactIds`
- Case 2 (exact match): Returns consolidated contact without creating duplicate rows
- Case 3 (partial match): Creates a secondary contact correctly linked to the primary
- Case 4 (two primaries merge): Older contact stays primary; newer becomes secondary; all of newer's secondaries re-link to the older primary
- Response format matches spec exactly:
  ```json
  {
    "contact": {
      "primaryContactId": number,
      "emails": ["primary_email", ...],
      "phoneNumbers": ["primary_phone", ...],
      "secondaryContactIds": [...]
    }
  }
  ```
  *(Note: Fixed from spec's `primaryContatctId` typo to `primaryContactId`)*

---

## Phase 4 — API Layer (Route, Controller, Validation)

### Objective
Wire up the `/identify` POST endpoint with Zod validation, clean error handling, and correct HTTP responses.

### Technical Decisions
- Zod schema validates request body; rejects if both `email` and `phoneNumber` are missing
- `phoneNumber` accepted as either `string` or `number` in input (coerced to `string` internally for storage)
- Global error handler returns structured JSON errors with appropriate status codes
- No authentication required (per spec)

### Tasks
- [ ] Define Zod schemas in `identify.schema.ts`:
  - `IdentifyRequestSchema`: `{ email?: string, phoneNumber?: string | number }`
  - Refinement: at least one of `email` or `phoneNumber` must be provided
  - Transform: coerce `phoneNumber` to string if provided as number
- [ ] Implement validation middleware (`validate.ts`): generic Zod middleware factory
- [ ] Implement `identify.controller.ts`:
  - Parse & validate request body
  - Call `contactService.identifyContact(email, phoneNumber)`
  - Return 200 with consolidated response
- [ ] Register route in `identify.route.ts`: `POST /identify`
- [ ] Mount route in `app.ts`
- [ ] Implement global error handler middleware:
  - `AppError` → return `{ error: message }` with correct status code
  - Zod validation error → 400 with field-level details
  - Unknown error → 500 with generic message (no stack leak in production)
- [ ] Add `GET /health` endpoint for uptime monitoring

### Acceptance Criteria
- `POST /identify` with valid body returns 200 with correct consolidated contact
- `POST /identify` with empty body returns 400 with validation error
- `POST /identify` with only `email` or only `phoneNumber` works correctly
- Unknown routes return 404
- Internal errors return 500 without leaking stack traces
- Health check responds at `GET /health`

---

## Phase 5 — Integration Testing & Edge Cases

### Objective
Validate the entire flow end-to-end through the API surface. Ensure all edge cases from the spec are covered.

### Technical Decisions
- Use Jest with `supertest` for HTTP-level integration tests
- Test against a real database (test-specific PostgreSQL database or SQLite for CI)
- Reset database state between test suites
- Tests ordered to match spec examples

### Tasks
- [ ] Configure Jest (`jest.config.ts`) with `ts-jest` preset
- [ ] Set up test database teardown/setup helpers
- [ ] Test Case 1: New contact — no existing matches → creates primary
- [ ] Test Case 2: Existing contact, shared phone, new email → creates secondary
- [ ] Test Case 3: Request matching existing linked set → returns consolidated, no new row
- [ ] Test Case 4: Two separate primaries merge → older stays primary, newer → secondary
- [ ] Test Case 5: Only email provided → works
- [ ] Test Case 6: Only phoneNumber provided → works
- [ ] Test Case 7: phoneNumber as number type → accepted, coerced to string
- [ ] Test Case 8: Empty body → 400
- [ ] Test Case 9: Multiple secondaries already exist → correct consolidation
- [ ] Test Case 10: Cascading re-link on primary merge (newer primary has secondaries)
- [ ] Add `test` script to `package.json`

### Acceptance Criteria
- All test cases pass
- Tests cover all four reconciliation scenarios from the spec
- Tests can run in CI without manual setup
- Zero flaky tests (deterministic ordering via `createdAt`)

---

## Phase 6 — Production Hardening & Deployment

### Objective
Prepare the service for production deployment with logging, graceful shutdown, and hosting.

### Technical Decisions
- Deploy to Render.com free tier (per spec recommendation)
- Use `tsc` build for production, run `node dist/index.js`
- Graceful shutdown: close Prisma connections on SIGTERM/SIGINT
- Add request logging (morgan or simple custom middleware)
- Rate limiting not required per spec but easy to add later

### Tasks
- [ ] Add `build` script: `tsc`
- [ ] Add `start` script: `node dist/index.js`
- [ ] Implement graceful shutdown in `index.ts` (close Prisma client on process signals)
- [ ] Add request logging middleware
- [ ] Create `README.md`:
  - Project description
  - Tech stack
  - Setup instructions (local dev)
  - API documentation (endpoint, request/response format, examples)
  - Hosted endpoint URL
- [ ] Configure for Render deployment:
  - Build command: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
  - Start command: `npm start`
- [ ] Verify production build works locally via `npm run build && npm start`
- [ ] Deploy and verify `/identify` endpoint is live

### Acceptance Criteria
- `npm run build` produces `dist/` with zero errors
- `npm start` runs the production server
- Server shuts down gracefully on SIGTERM (no orphan DB connections)
- Deployed endpoint responds to POST `/identify` correctly
- README is complete with setup instructions and hosted URL

---

## Implementation Order Summary

```
Phase 1: Scaffolding     → Skeleton compiles and runs
Phase 2: Database        → Schema migrated, repository ready
Phase 3: Business Logic  → Core algorithm implemented
Phase 4: API Layer       → Endpoint wired and validated
Phase 5: Tests           → All edge cases verified
Phase 6: Production      → Deployed and live
```

Each phase builds on the previous one. No phase should be started until the prior phase's acceptance criteria are fully met.
