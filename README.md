# LoyaltyLedger

**A multi-tenant B2B SaaS loyalty platform** — any retail business signs up, configures a points program, and runs it at their POS counter. Customers earn points on every bill, redeem them at checkout, and climb tiers that earn faster.

**Live demo:** [loyalty-system-pos.vercel.app](https://loyalty-system-pos.vercel.app) — register your own business and try it end to end.

![Node](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)

---

## Architecture

```
   Vercel (React SPA)         Render (Express API)           MongoDB Atlas
  ┌───────────────────┐      ┌─────────────────────────┐    ┌─────────────────┐
  │ 13 pages           │      │ routes → validate (zod) │    │ 15 collections  │
  │ role-aware nav     │─────▶│  → auth (JWT verify)    │───▶│ tenantId-scoped │
  │ axios auto-refresh │      │  → rbac (roles + perms) │    │ compound indexes│
  └───────────────────┘      │  → controller (thin)    │    └─────────────────┘
    /api/* rewrite            │  → service (all logic)  │
    (no CORS needed)          ├─────────────────────────┤
                              │ node-cron:              │
                              │  point expiry (00:05)   │
                              │  tier downgrade (00:10) │
                              └─────────────────────────┘
```

**Multi-tenancy:** shared database, `tenantId` discriminator on every document, leading every compound index, enforced in every query. One merchant can never see another's data.

**Actors:** Platform Admin (`tenantId: null`) → Merchant Owner → Manager → Staff, with a granular per-module read/write permission matrix (`Role.access[]`) on top of the coarse roles.

## The interesting engineering

### Hybrid auth — stateless speed, stateful control
- **Access token**: 15-min JWT, never stored anywhere. Every request verifies cryptographically — zero DB reads on the hot path.
- **Refresh token**: 7-day JWT whose **SHA-256 hash** lives in MongoDB. This enables **rotation** (one-time use — each refresh deletes the old hash), **instant revocation** (logout deletes the hash; a stolen token dies immediately), and **logout-all-devices**. A TTL index garbage-collects expired sessions.
- Separate signing secrets per token type, bcrypt(12) passwords with `select: false`, enumeration-safe login errors, rate-limited auth routes.

### Idempotent order engine
`POST /api/orders` runs one atomic MongoDB transaction:
1. **redeem** — burn credit lots **FIFO by soonest expiry** from an append-only ledger
2. **earn** — resolve the earn rule (tier-specific beats catch-all), apply the tier multiplier, write a credit lot with its own expiry date
3. recursive **tier upgrade check** against configurable spend/visit thresholds (AND/OR)
4. cache the response under the client's `Idempotency-Key` — a retried bill returns the cached result, never double-awards
5. **audit log** — every sensitive action is recorded (actor, before/after)

`Wallet.balance` is a derived cache (`$inc`); the ledger is the source of truth and the balance is always recomputable.

### Nightly jobs (node-cron)
- **Point expiry** — expires stale credit lots and deducts unused points, race-safe against concurrent redemptions
- **Tier downgrade** — members who missed retain thresholds drop down the tier chain, with history logged

## Feature surface

| Area | What's there |
|---|---|
| Auth | signup (atomic tenant+owner), login, refresh rotation, logout, logout-all, profile + password change (revokes all sessions) |
| Members | enroll (wallet + default tier, transactional), live POS typeahead search, quick-enroll, profile, full points history |
| POS | phone lookup → balance card → bill entry → earn/redeem in one order, instant receipt |
| Program | tiers (multipliers, upgrade/downgrade policy chains), earn rules (per-tier or catch-all, caps, expiry) |
| Team | staff accounts, custom permission roles (9 modules × read/write), deactivation that actually locks out |
| Analytics | members, points liability, earned/redeemed 30d, tier distribution, member ledger |
| Platform admin | tenant list, full vendor detail (owner, team, stats, last activity), suspend/activate/cancel |

## Monorepo layout

```
server/   Express 4 API (ESM) — config / models / middleware / validators /
          services / controllers / routes / jobs
client/   React 18 + Vite + Tailwind 4 SPA — TanStack Query, role-guarded routes
```

Conventions: controllers are thin classes with static handlers; **all business logic lives in services**; services never touch `req`/`res`; every multi-step write uses `session.withTransaction`.

## Running locally

**Prereqs:** Node 20+, a MongoDB Atlas cluster (replica set — transactions require it).

```bash
# 1. Server
cd server && npm install
cat > .env << 'EOF'
NODE_ENV=development
PORT=5001
MONGODB_URI=<your-atlas-uri>
JWT_ACCESS_SECRET=<64-byte hex>   # node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_REFRESH_SECRET=<different 64-byte hex>
CLIENT_ORIGIN=http://localhost:5173
PLATFORM_ADMIN_NAME=<your name>
PLATFORM_ADMIN_EMAIL=<admin email>
PLATFORM_ADMIN_PASSWORD=<admin password>
EOF
npm run seed   # creates the platform admin
npm run dev    # http://localhost:5001

# 2. Client (new terminal)
cd client && npm install
npm run dev    # http://localhost:5173 — /api proxied to :5001
```

## Deployment

- **Client** → Vercel (root directory `client`); `vercel.json` rewrites `/api/*` to the backend (no CORS) and falls back to `index.html` for SPA routes
- **Server** → Render (root directory `server`), env vars in the dashboard, `/health` as the health check
- **DB** → MongoDB Atlas

## Roadmap

- Razorpay subscription billing with plan-limit enforcement and suspension cutoff
- Member self-service portal (phone OTP behind a provider-agnostic adapter)
- Merchant API keys + HMAC-signed outbound webhooks
- Vitest + Supertest suite in GitHub Actions
