# Identity Reconciliation Service

A production-grade backend service that reconciles customer identities across multiple purchases. Built for the [Bitespeed Backend Task](https://bitespeed.io).

## Live Endpoint

> **`https://identity-reconciliation-service-0xmf.onrender.com/identify`**

---

## Tech Stack

- **Runtime:** Node.js 18+
- **Language:** TypeScript (strict mode)
- **Framework:** Express
- **Database:** PostgreSQL (Supabase)
- **ORM:** Prisma
- **Validation:** Zod
- **Config:** dotenv

---

## Design Highlights

- **Transactional Integrity:** All identity reconciliation operations (reads, merges, inserts) are wrapped in a single Prisma `$transaction`. This ensures atomicity — if any step fails (e.g., during a primary merge), all changes are rolled back, preventing data corruption from partial updates.
- **Repository Pattern:** All database access is isolated behind a repository layer. Every repository method accepts an optional transaction client (`tx`), allowing the service layer to coordinate multi-step operations within a single transaction boundary.

---

## API

### `POST /identify`

Identifies and consolidates contacts based on `email` and/or `phoneNumber`.

**Request Body:**
```json
{
  "email": "doc@hillvalley.edu",
  "phoneNumber": "123456"
}
```

> At least one of `email` or `phoneNumber` must be provided. `phoneNumber` accepts both string and number types.

**Response (200):**
```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["doc@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```

### `GET /health`

Returns `{ "status": "ok" }` — for uptime monitoring.

---

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL database (or a [Supabase](https://supabase.com) project)

### Setup

```bash
# Clone
git clone https://github.com/<your-username>/identity-reconciliation-service.git
cd identity-reconciliation-service

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and DIRECT_URL

# Run migrations
npx prisma migrate dev

# Start development server
npm run dev
```

The server starts at `http://localhost:3000`.

### Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm test` | Run Jest tests |

### API Testing

Use the included test script to verify all endpoints:

```bash
# Test local development server
bash test-api.sh

# Test production deployment
bash test-api.sh https://identity-reconciliation-service-0xmf.onrender.com

# Or use Node.js test script
node test.js https://identity-reconciliation-service-0xmf.onrender.com
```

The script tests:
- Health check endpoint
- Input validation
- Primary contact creation
- Secondary contact linking
- Contact consolidation scenarios

---

## Project Structure

```
src/
├── index.ts                  # Server bootstrap + graceful shutdown
├── app.ts                    # Express app (middleware, routes)
├── config/
│   ├── env.ts                # Zod-validated environment config
│   └── prisma.ts             # Prisma client singleton
├── controllers/
│   └── identify.controller.ts
├── services/
│   └── contact.service.ts    # Core reconciliation logic
├── repositories/
│   └── contact.repository.ts # Database access layer
├── routes/
│   └── identify.route.ts
├── schemas/
│   └── identify.schema.ts    # Zod request validation
├── middlewares/
│   ├── error-handler.ts      # Global error handler
│   ├── request-logger.ts     # Request logging
│   └── validate.ts           # Zod validation middleware
├── types/
│   └── contact.types.ts
└── utils/
    └── app-error.ts          # Custom error class
prisma/
└── schema.prisma             # Database schema
```

---

## Database Schema

```sql
Contact
├── id              Int       (PK, auto-increment)
├── phoneNumber     String?
├── email           String?
├── linkedId        Int?      (FK → Contact.id)
├── linkPrecedence  "primary" | "secondary"
├── createdAt       DateTime
├── updatedAt       DateTime
└── deletedAt       DateTime?
```

---

## Deployment (Render)

1. Push code to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Set environment variables: `DATABASE_URL`, `DIRECT_URL`, `NODE_ENV=production`.
4. **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
5. **Start Command:** `npm start`

---

## License

ISC

---

Build with ❤️ By [Santhosh](https://www.linkedin.com/in/santhosh-kumar-81744b2aa)

