# Technical Requirements Document (TRD)
### LoyaltyLedger

> The complete technical blueprint: stack, architecture, API design, authentication, authorization, data layer, security, performance, jobs, testing, and deployment. **Language: JavaScript (ES Modules) — not TypeScript.**

---

## 1. Technology stack

### 1.1 Languages & runtime
- **JavaScript (ES2022, ES Modules)** everywhere — `"type": "module"`. No TypeScript.
- **Node.js 20+** runtime.

### 1.2 Backend
| Concern | Choice | Notes |
|---|---|---|
| Web framework | **Express 4** | REST API |
| ODM | **Mongoose 8** | schemas, validation, transactions |
| Database | **MongoDB Atlas** | replica set (required for multi-document transactions) |
| Auth | **jsonwebtoken** (JWT) + **bcryptjs** | access/refresh tokens, password hashing |
| Validation | **zod** | request-body/params validation at the edge |
| Security headers | **helmet** | safe HTTP headers |
| CORS | **cors** | restrict to client origin |
| Logging | **morgan** (dev) + structured console (prod) | request + error logging |
| Scheduling | **node-cron** | tier recompute, metering, invoicing, expiry |
| Rate limiting | **express-rate-limit** | auth + money routes |
| Testing | **Vitest** + **Supertest** | unit + integration |

### 1.3 Frontend
| Concern | Choice |
|---|---|
| Framework | **React 18** (functional components + hooks) |
| Build tool | **Vite** |
| Styling | **Tailwind CSS** |
| Routing | **React Router** |
| HTTP | **axios** (instance + interceptors) |
| Charts | **Recharts** |
| State | React Context + hooks (no Redux for MVP) |

### 1.4 Infrastructure / deployment
| Concern | Choice |
|---|---|
| API hosting | Render / Railway / Fly.io |
| Client hosting | Vercel |
| Database | MongoDB Atlas |
| Secrets | environment variables (never committed) |
| CI | GitHub Actions (lint + test) |

---

## 2. Architecture

### 2.1 Layered, MVC + service layer

```
React clients ── HTTPS + Bearer JWT ──▶ Express API
   Express:  routes ─▶ controllers (thin) ─▶ services (logic) ─▶ models (Mongoose) ─▶ MongoDB
   Cross-cutting middleware: validate ▶ auth ▶ tenant ▶ rbac ▶ idempotency ▶ error
   Background jobs (node-cron): tier recompute · metering · invoicing · expiry
```

**Strict one-directional dependency:** `route → controller → service → model`.
- **Controllers** are thin: read `req`, call a service, write `res`. No DB access, no business logic.
- **Services** hold all business logic and own all DB access. Never touch `req`/`res`. Receive `tenantId` and `actorUserId` as explicit arguments.
- **Models** are Mongoose schemas only.

**Rationale:** keeps money/business logic unit-testable without HTTP, and keeps the codebase navigable. `app.js` builds the Express app (no `listen`); `server.js` connects the DB then listens — so tests can import `app` directly.

### 2.2 Project structure
```
server/src/
  config/      env.js · db.js
  models/      one file per collection
  controllers/ thin req/res handlers
  services/    loyalty · ledger · audit · billing · analytics · auth
  middleware/  auth · tenant · rbac · validate · idempotency · error
  routes/      index.js + one router per resource
  validators/  zod schemas per resource
  jobs/        tierRecompute · invoice · pointExpiry · scheduler
  utils/       ApiError · asyncHandler · token · earnRule
  app.js · server.js
client/src/
  api/ · components/ · features/ · pages/ · hooks/ · context/
```

---

## 3. API design

### 3.1 Style & conventions
- **REST/JSON** over HTTPS. Base path `/api`.
- **Response envelopes:** success `{ success:true, data }`; error `{ success:false, message, details? }`.
- **Status codes:** 200/201 success; 400 validation/business; 401 auth; 403 role; 404 not found; 409 conflict; 429 rate limit; 500 unexpected.
- **Pagination:** cursor-based on list endpoints — `?limit=&cursor=` → `{ data, nextCursor }`. (No `skip`/`limit` on large collections.)
- **Idempotency:** money-mutating routes require an `Idempotency-Key` header.
- **Versioning:** path-based when needed (`/api/v1`), single version for MVP.

### 3.2 Endpoint groups
Auth · Programs/Tiers/Rewards · Members · Transactions (accrual) · Redemptions · Adjustments · Analytics · Billing/Invoices/Subscriptions/Plans · Audit · Platform. (Full contract lives in the backend/API spec; PRD lists the features.)

### 3.3 Request lifecycle (protected route)
`validate → auth → tenant → rbac → (idempotency on money routes) → controller → service (transaction for money ops) → response`. Errors flow via `asyncHandler` → central error middleware.

---

## 4. Authentication

### 4.1 Strategy: JWT (access + refresh)
- **Access token:** short-lived (~15 min), sent as `Authorization: Bearer`. Stateless.
- **Refresh token:** longer-lived (~7 days); used at `/api/auth/refresh` to mint a new access token. Rotation recommended (issue new refresh, invalidate old) to detect theft.
- **Claims:** `{ userId, tenantId, role }`. Putting `tenantId` in the signed token means tenant scoping needs no DB lookup and cannot be forged.
- **Secret:** from env; tokens signed with HS256 (or RS256 if asymmetric is desired).

### 4.2 Passwords
- Hashed with **bcrypt** (cost factor 12). Never stored in plaintext, never returned (`select:false` + stripped in `toJSON`).
- Login failures return a generic message (no user enumeration).

---

## 5. Authorization

### 5.1 RBAC
- Roles: `PLATFORM_ADMIN`, `MERCHANT_OWNER`, `MERCHANT_MANAGER`, `MERCHANT_STAFF`, `MEMBER`.
- Enforced by a `requireRole(...roles)` middleware factory at the route layer.

### 5.2 Tenant scoping (the core of multi-tenancy)
- Every service query filters by `tenantId`, passed explicitly as a function argument (chosen over a "magic" auto-inject plugin for clarity and learnability; the plugin approach is the scaling alternative).
- **Defense in depth:** role check (route) + tenant filter (query). Neither alone is sufficient.
- Sensitive operations (manual adjustments, staff management) additionally require `MERCHANT_OWNER` and are always audited.

---

## 6. Data layer

### 6.1 MongoDB + Mongoose
- **Multi-document transactions** for all money paths (ledger write + balance update + audit + idempotency record commit together). Requires the Atlas replica set.
- **Append-only ledger** as the source of truth; member `pointsBalance` is a derived cache.
- **Integer money/points** (smallest unit) — never floats.
- **Idempotency** via a dedicated `idempotencyKeys` collection with a unique `(tenantId, key)` index; the record is written inside the same transaction as the effect.

### 6.2 Indexing strategy
- Compound indexes **leading with `tenantId`** (the always-present, most-selective filter).
- Unique indexes for: `(tenantId, email)` on users, `(tenantId, externalRef)` on members, `(tenantId, key)` on idempotencyKeys, `(tenantId, period)` on invoices, `(tenantId, metric, period)` on usageRecords.
- `createdAt` indexes for time-range queries and cursor pagination on ledger/audit.

### 6.3 Consistency & recovery
- Balances are read **inside** the transaction immediately before writing, so `balanceAfter` is computed from a consistent snapshot.
- A reconciliation/repair job can recompute any member's cache as `Σ ledger points` (canonical recovery).

---

## 7. Security (OWASP-aware)

- **Tenant isolation** enforced on every query (primary risk in multi-tenant SaaS).
- **Input validation** with zod at the edge; **parameterized** Mongoose queries (no injection).
- **Authn/Authz** as above; **rate limiting** on auth + money routes.
- **Secrets** only in env; `.env` git-ignored.
- **Transport** over HTTPS; **helmet** for headers; **CORS** restricted to the client origin.
- **Password hashing** with bcrypt; **JWT** short expiry + refresh rotation.
- **Idempotency** on money operations to prevent duplicate effects.
- **Audit trail** for accountability.
- **No sensitive data** in URLs/logs.
- Document OWASP Top-10 mitigations in the README.

---

## 8. Performance & scalability

- **Read-model separation (CQRS-lite):** pre-aggregate analytics (nightly summaries or cached aggregation pipelines) instead of computing on every request.
- **Cursor pagination** to keep deep reads fast.
- **Caching:** optional Redis for hot analytics + idempotency lookups (MVP can use Mongo + short TTL).
- **Scaling path (documented for interviews):** stateless API horizontal scaling (JWT enables this); MongoDB read replicas for analytics reads; partition the ledger by tenant/time as it grows; move heavy jobs to a queue (BullMQ) under load.

---

## 9. Background jobs

- **Scheduler:** node-cron, registered in `jobs/scheduler.js`, started from `server.js`.
- **Jobs:** tier recompute (daily), usage metering + invoice generation (monthly), point expiry (daily, advanced/optional), optional nightly analytics aggregation.
- All jobs are **idempotent** (safe to re-run) and tenant-aware; job-initiated writes audit with a null actor.

---

## 10. Error handling & logging

- Custom `ApiError(statusCode, message, details?)` thrown deliberately for expected errors.
- `asyncHandler` wraps controllers so thrown errors reach a single **central error middleware** that shapes the standard error envelope. Controllers contain no try/catch.
- 5xx errors are logged with stack; 4xx are not noise-logged. Stack traces only in development.

---

## 11. Testing strategy

- **Unit:** pure functions (`evaluateEarnRule`, invoice math) and services with a test DB.
- **Integration:** Supertest against the imported `app` — focus on **money paths**: accrual idempotency, redemption insufficient-funds, transaction atomicity, tenant isolation.
- **Coverage priority:** correctness of the ledger and billing over UI.

---

## 12. Key technical decisions & trade-offs

| Decision | Choice | Why / trade-off |
|---|---|---|
| Database | MongoDB (not Postgres) | Flexible schema + transactions; we engineer ledger correctness ourselves. Postgres+RLS gives referential integrity/isolation for free — correctness here comes from the ledger pattern + transactions, not the engine. |
| Language | JavaScript (ES Modules) | Per requirement; lower ceremony. Trade-off vs TypeScript: less compile-time safety, mitigated by zod runtime validation + tests. |
| Auth | JWT access+refresh | Stateless, horizontally scalable; revocation handled via short expiry + refresh rotation. |
| Tenancy | Shared DB + `tenantId` discriminator | Simplest, most common for early SaaS; trade-off vs schema/DB-per-tenant is operational cost vs isolation strength. |
| Tenant scoping | Explicit `tenantId` argument | Visible and testable; auto-inject plugin is the scaling alternative. |
| Money type | Integer smallest-unit | Avoids float rounding errors. |
| Analytics | Pre-aggregated read models | Fast dashboards; trade-off is eventual consistency of summaries. |

---

## 13. Non-functional requirements

- **Availability:** graceful shutdown (SIGTERM/SIGINT); connect DB before listening.
- **Configurability:** all config via validated env (`config/env.js` fails fast on missing vars).
- **Maintainability:** consistent model template + `toJSON` transform across schemas.
- **Observability:** structured request + error logs; health endpoint.
- **Portability:** 12-factor style; no machine-specific assumptions.