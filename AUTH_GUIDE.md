# Authentication System Guide — LoyaltyLedger
### Written for: Vaibhav (Fresher SDE) | By: Senior Engineering Perspective

---

## How to read this document

Read it **top to bottom, once, before writing a single line of code.** The concepts in Part 1 will make every line you write in Parts 2 and 3 make complete sense. If you skip to the code, you'll copy it without understanding — and that will fail you in interviews and in debugging.

---

# PART 1 — THE CONCEPTS (Master These for Interviews)

---

## 1.1 Authentication vs Authorization — The Most Commonly Confused Pair

These are two different questions asked at two different points in every request.

| Term | Question | Example |
|---|---|---|
| **Authentication (AuthN)** | *Who are you?* | "I am Vaibhav, the platform admin" |
| **Authorization (AuthZ)** | *What are you allowed to do?* | "You can see all tenants, but a merchant staff cannot" |

**Authentication happens first, always.** You cannot authorize someone you don't know yet.

In code terms: auth middleware runs first, sets `req.user = { userId, tenantId, role }`, and THEN the role-check middleware uses `req.user.role` to decide if the action is allowed.

**Interview answer:** "Authentication verifies identity using credentials (password, token). Authorization verifies permissions using that identity. They are sequential — you can't skip or reverse the order."

---

## 1.2 Why We Don't Use Sessions (and What We Use Instead)

### The old way — Sessions
1. User logs in → server creates a "session" entry in the database → gives user a session ID cookie
2. Every request: server reads cookie → goes to DB → looks up session → checks who the user is
3. **Problem:** Every single request hits the database. If you have 1 million users, that's 1 million+ DB reads per minute just for authentication. It also means your server is "stateful" — it has to remember things. You can't run 10 servers in parallel without them sharing the same session store (Redis, etc.)

### The modern way — JWT (JSON Web Tokens)
1. User logs in → server verifies password → **signs a token** with a secret key → sends token to client
2. Every request: client sends token in header → server **mathematically verifies the token** — no DB needed
3. **The magic:** The server can verify the token is valid without any database lookup, because only the server knows the secret key that was used to sign it.

**The result is a stateless server.** You can run 10 identical API servers, and any of them can verify any token, because they all share the same secret key. This is horizontal scaling.

**Interview answer:** "JWTs allow stateless authentication. The server embeds the user's identity into a cryptographically signed token. Any server instance with the signing secret can verify it without a database round-trip. This enables horizontal scaling."

---

## 1.3 Anatomy of a JWT — Know This Cold

A JWT looks like this:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NjEiLCJyb2xlIjoiTUVSQ0hBTlRfT1dORVIiLCJ0ZW5hbnRJZCI6IjEyMyIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAwOTAwfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

It has **exactly three parts separated by dots:**

```
HEADER . PAYLOAD . SIGNATURE
```

### Part 1 — Header (base64 encoded, not encrypted)
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```
Says: "I am a JWT, signed with HMAC-SHA256 algorithm."

### Part 2 — Payload / Claims (base64 encoded, NOT encrypted — anyone can read it)
```json
{
  "userId": "661",
  "tenantId": "123",
  "role": "MERCHANT_OWNER",
  "iat": 1700000000,
  "exp": 1700000900
}
```
- `iat` = issued at (Unix timestamp)
- `exp` = expiry time (Unix timestamp). Library auto-rejects expired tokens.
- `userId`, `tenantId`, `role` = our custom claims

**CRITICAL:** The payload is NOT encrypted. It is only Base64-encoded. Anyone can decode it. This means:
- **Never put sensitive data in a JWT payload** (no passwords, no credit card numbers, no secrets)
- What goes in: identity data that you'd be OK with the client seeing

### Part 3 — Signature (this is the security)
```
HMACSHA256(
  base64(header) + "." + base64(payload),
  YOUR_SECRET_KEY
)
```
The signature is created by running the header + payload through a hashing function using your server's secret key. 

**Why this provides security:** If someone modifies the payload (e.g., changes `role: "MERCHANT_STAFF"` to `role: "PLATFORM_ADMIN"`), the signature will no longer match. The server rejects it. You cannot forge a valid signature without knowing the secret key.

**Interview answer:** "JWT has three base64-encoded parts: header (algorithm), payload (claims), and signature. The signature is an HMAC hash of the header+payload using the server secret. Any tampering with the payload invalidates the signature. The payload is readable by anyone — you must never put secrets in it."

---

## 1.4 The Access Token + Refresh Token Pattern — With DB-Backed Refresh Tokens

Here's a core problem: if JWTs are stateless, how do you log someone out? You can't "delete" a token — it's just a string in the client's memory. Once issued, it's valid until it expires.

**The naive solution:** make access tokens short-lived (15 min) and use a refresh token (7 days) to get new ones.

**The problem with naive:** if both tokens are pure JWTs verified only cryptographically, you have NO way to revoke a stolen refresh token before its 7-day expiry. Logout is fake — the client forgets the token, but the server will still honor it if an attacker has a copy.

**Our solution:** keep access tokens as pure stateless JWTs (fast, no DB hit per request), but store refresh tokens in the database — hashed.

```
ACCESS TOKEN  — short-lived JWT (15 min), NEVER stored in DB, lives only in client memory
REFRESH TOKEN — long-lived (7 days), raw token on client, SHA-256 hash stored in DB
```

### The complete flow:

```
LOGIN:
  Client sends email + password
  Server verifies password
  Server signs access token  (JWT, 15min) ← NOT stored anywhere on server
  Server signs refresh token (JWT, 7 days)
  Server hashes refresh token with SHA-256 → saves hash to RefreshToken collection
  Returns both tokens to client

NORMAL REQUESTS (while access token is valid):
  Client: Authorization: Bearer <access_token>
  Server: verifyAccessToken() → no DB hit → serves request

ACCESS TOKEN EXPIRES (after 15 min):
  Client sends: POST /api/auth/refresh { refreshToken: "..." }
  Server:
    1. verifyRefreshToken(raw) → check JWT signature + expiry
    2. hash(raw) → look up hash in RefreshToken collection
    3. If not found → token was already used or was revoked → 401 (force re-login)
    4. If found → DELETE the old record (rotation: one-time use)
    5. Sign new access token + new refresh token
    6. Save new refresh token hash to DB
    7. Return new pair to client

LOGOUT:
  Client sends: POST /api/auth/logout { refreshToken: "..." }
  Server: hash(raw) → delete from RefreshToken collection
  Result: even if attacker has a copy, the hash is gone — 401 on next use

ATTACKER STEALS REFRESH TOKEN + USES IT:
  Attacker calls /refresh with the stolen token
  Server finds the hash in DB, deletes it, issues new pair
  Real user's copy of the old token is now gone from DB
  When real user tries to refresh → hash not found → 401 → forced to re-login
  (This is token reuse detection — you can optionally nuke ALL sessions for this user here)
```

### Why hash the refresh token before storing it?

If someone breaches your DB and reads the `RefreshToken` collection, they get only SHA-256 hashes. SHA-256 is not bcrypt (we don't need slowness here — we need speed because every refresh call hashes). The raw tokens are never in the DB. Even a full DB dump gives the attacker nothing usable.

### Why NOT store access tokens in DB?

Access tokens are verified every single request. If you stored them in DB, every request would require a DB lookup — destroying the stateless scaling advantage of JWTs. 15 minutes is short enough that the risk window is acceptable. The refresh token in DB handles the revocation problem for long-lived sessions.

### The security model at a glance:

| Threat | Protection |
|---|---|
| Stolen access token | 15-minute expiry — max 15min attacker window |
| Stolen refresh token | Hash in DB → logout deletes it → immediately revoked |
| DB breach | Only SHA-256 hashes stored — useless without raw tokens |
| Token reuse (stolen + used) | Rotation detects reuse → old hash gone → real user forced to re-login |
| Fake/tampered token | JWT signature verification catches it — no DB needed |

**Interview answer:** "Access tokens are stateless JWTs verified cryptographically — no DB hit per request. Refresh tokens are stored as SHA-256 hashes in the database. On refresh, we verify the JWT signature AND look up the hash in DB — both must pass. Rotation deletes the hash on use, so reuse is detected. Logout deletes the hash so the token is immediately dead even if stolen. This gives us instant revocation without sacrificing the stateless performance of access tokens."

---

## 1.5 Password Hashing with bcrypt — Why You NEVER Store Passwords

If you store `password: "mypassword123"` in your database and someone breaches your DB, every user's password is exposed — including passwords they reuse on their bank accounts. This is a catastrophic security failure.

**Hashing:** A one-way function. `hash("mypassword123") = "$2b$12$abc...xyz"`. You cannot reverse it to get "mypassword123". You can only hash a new input and compare.

**bcrypt is special because it is intentionally slow:**

```
MD5 hash:    ~1 billion hashes/second (fast = bad for passwords)
bcrypt(12):  ~300 hashes/second       (slow = good for passwords)
```

The cost factor (12 in our case) makes it take ~300ms per hash. This makes brute-force attacks impractical — an attacker testing millions of passwords will be blocked by time.

**Salt:** bcrypt automatically generates a random "salt" (random string mixed into your password before hashing). Even if two users have the same password, their hashes will be different. This defeats rainbow table attacks (pre-computed hash dictionaries).

```
// What bcrypt stores (the hash contains the salt inside it):
"$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
   ↑    ↑   ↑
  algo cost  salt + hash (all in one string)
```

**Verify flow:**
```
User sends "mypassword123"
bcrypt.compare("mypassword123", storedHash)
 → extracts salt from storedHash
 → hashes the input with that same salt
 → compares result to storedHash
 → returns true/false
```

**Interview answer:** "bcrypt is a slow, salted hashing algorithm. Slow = brute-force resistant. Salted = same password produces different hashes, defeating rainbow tables. We store only the hash, never the plaintext. We use bcrypt.compare() to verify — we never decrypt."

---

## 1.6 RBAC — Role-Based Access Control

In our system, different users can do different things. We encode this as a role.

```
PLATFORM_ADMIN   → can do everything, see all tenants, manage platform
MERCHANT_OWNER   → can manage their tenant: create staff, configure programs, see all analytics
MERCHANT_MANAGER → can manage day-to-day: view/edit members, transactions (no billing, no staff creation)
MERCHANT_STAFF   → can operate POS: earn/redeem points for members
MEMBER           → can view their own loyalty profile (mobile app use case, optional MVP)
```

**Implementation:** A middleware factory `requireRole(...allowedRoles)` that checks `req.user.role`:

```javascript
// Route definition:
router.post('/staff', requireRole('MERCHANT_OWNER', 'MERCHANT_MANAGER'), createStaffController);

// If a MERCHANT_STAFF tries to hit this route, they get 403 Forbidden
```

**Why a factory function?** Because different routes need different role requirements. A factory lets you pass the allowed roles at route definition time.

**Interview answer:** "RBAC assigns permissions to roles, not to individual users. You check the role on every protected route. A middleware factory `requireRole(...roles)` reads `req.user.role` (set by auth middleware) and rejects with 403 if the role isn't in the allowed list."

---

## 1.7 Multi-Tenancy + Auth — The Core of This System

This is the most unique challenge in LoyaltyLedger. A single database contains data for 100 different merchants. Merchant A must NEVER see Merchant B's data.

**How we enforce this:**

1. **Every user document has a `tenantId` field** (except Platform Admin, who has `null`)
2. **`tenantId` is embedded in the JWT payload** when the token is issued
3. **Every service function receives `tenantId` as an explicit argument** and includes it in every DB query

```javascript
// Service function — tenantId ALWAYS scopes the query
async function getMember(tenantId, memberId) {
  return Member.findOne({ _id: memberId, tenantId });
  //                                      ↑ this is the isolation guarantee
}
```

If `tenantId` wasn't in the query and a merchant somehow got a memberId from another tenant, they'd see that member's data. The explicit `tenantId` filter on every query prevents this.

**Why put `tenantId` in the JWT?** Because the JWT is signed. A malicious user cannot change their `tenantId` from "merchant-A" to "merchant-B" — changing the payload would break the signature and the server would reject the token. So `tenantId` in JWT = unforgeable tenant identity.

**The Platform Admin exception:** Platform Admin has `tenantId: null` in their token. When Platform Admin calls a route, the service can be given the target `tenantId` from the request params (e.g., `GET /api/platform/tenants/:tenantId/members`).

**Interview answer:** "In our shared-database multi-tenant architecture, tenant isolation is enforced at two layers: the JWT claim (tenantId cannot be forged because the token is signed) and the DB query filter (every query includes tenantId). Defense in depth — neither alone is sufficient."

---

# PART 2 — OUR SYSTEM DESIGN

---

## 2.1 Who Are the Users? (User Types)

```
┌──────────────────────────────────────────────────────┐
│                  LoyaltyLedger Platform               │
│                                                       │
│  PLATFORM_ADMIN (you — Vaibhav)                       │
│  tenantId: null                                       │
│  Created by: seed script (not signup)                 │
│  Can: see all tenants, manage plans, platform ops     │
│                                                       │
│  ┌──────────────────┐   ┌──────────────────┐         │
│  │  Tenant: "ZestCafe"│   │ Tenant: "MegaMart"│         │
│  │  tenantId: abc123 │   │ tenantId: def456  │         │
│  │                   │   │                   │         │
│  │  MERCHANT_OWNER   │   │  MERCHANT_OWNER   │         │
│  │  MERCHANT_MANAGER │   │  MERCHANT_MANAGER │         │
│  │  MERCHANT_STAFF   │   │  MERCHANT_STAFF   │         │
│  └──────────────────┘   └──────────────────┘         │
└──────────────────────────────────────────────────────┘
```

---

## 2.2 The Three Authentication Flows

### Flow A — Platform Admin Login
```
POST /api/auth/login
Body: { email, password }

1. Find User where email = given email AND role = PLATFORM_ADMIN
2. Verify password with bcrypt
3. Issue access token: { userId, tenantId: null, role: "PLATFORM_ADMIN" }
4. Issue refresh token
5. Return both tokens
```

### Flow B — Merchant Signup (Tenant Registration)
```
POST /api/auth/signup
Body: { businessName, ownerName, email, password, plan }

This is the MOST complex flow because you create TWO documents atomically:

START MongoDB Transaction
  1. Create Tenant: { businessName, plan, status: "active" }
  2. Hash the password
  3. Create User: { tenantId: newTenant._id, name: ownerName, email, passwordHash, role: "MERCHANT_OWNER" }
  4. If either fails → rollback both (atomicity guarantee)
COMMIT Transaction

5. Issue access token: { userId, tenantId: newTenant._id, role: "MERCHANT_OWNER" }
6. Issue refresh token
7. Return both tokens + tenant info
```

**Why a transaction?** If the Tenant record is created but the User creation fails (e.g., duplicate email), you'd have an orphaned Tenant with no owner. Transactions ensure both succeed or neither does.

### Flow C — Tenant User Login (Owner / Manager / Staff)
```
POST /api/auth/login
Body: { email, password }
(Same endpoint as Platform Admin — resolved by lookup)

1. Find User where email = given email
   (email is globally unique in practice — see design note below)
2. If not found → 401 "Invalid credentials" (generic — don't reveal if email exists)
3. Verify password with bcrypt
4. Issue access token: { userId, tenantId: user.tenantId, role: user.role }
5. Issue refresh token
6. Return tokens
```

### Design Note on Email Uniqueness
The DB has a compound unique index `(tenantId, email)` — the same email CAN theoretically exist in two different tenants. But for a SaaS where staff use their work emails to log in, emails will be globally unique in practice. For MVP, we find by email alone and get the tenantId from the user document. This is the simplest and most user-friendly approach.

---

## 2.3 JWT Claims Design

```javascript
// Access Token payload — embedded in every request, verified statlessly
{
  userId:   "64f...",           // User's MongoDB _id
  tenantId: "65a..." | null,    // null for Platform Admin
  role:     "MERCHANT_OWNER",   // One of the 5 roles
  iat:      1700000000,         // Issued at (auto-added by jsonwebtoken)
  exp:      1700000900          // 15 minutes later (auto-added)
}

// Refresh Token payload — minimal; real authority is the DB record, not this JWT
{
  userId:   "64f...",   // Just enough to identify the user when we look up the DB record
  iat:      1700000000,
  exp:      1700604800  // 7 days later
}
```

**Why is the refresh token payload so minimal?**
The JWT signature + expiry provides the first line of defence (tamper-proof, can't be forged). The DB record (`RefreshToken` collection) provides the second line (revocable, one-time-use). We don't need to embed `tenantId` or `role` in the refresh token payload — when it's used, we re-fetch the user from DB to get the freshest data, then embed it in the new access token.

---

## 2.4 The Middleware Chain — Every Protected Request

```
Incoming Request
      │
      ▼
┌─────────────┐
│   validate  │ ← zod checks req.body/params shape. Reject 400 if wrong.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    auth     │ ← Extract Bearer token. Verify JWT. Set req.user. Reject 401 if missing/invalid.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    rbac     │ ← Check req.user.role is in the allowed list. Reject 403 if not.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ controller  │ ← Thin handler. Reads req, calls service, sends res.
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   service   │ ← Business logic. Receives tenantId + actorUserId. Does DB work.
└─────────────┘
```

**Note on `tenantMiddleware`:** We don't need a separate tenant middleware for most routes because the tenantId is baked into the JWT. The controller extracts `req.user.tenantId` and passes it to the service. The service uses it in every query. Tenant isolation is enforced at the service layer.

---

## 2.5 Files You Need to Create (Implementation Roadmap)

```
Step 1:  server/src/config/constants.js          ← Role constants, token config
Step 2:  server/src/config/env.js                ← Environment variable validation
Step 3:  server/src/config/db.js                 ← MongoDB connection
Step 4:  server/src/models/Tenant.js             ← Tenant schema
Step 5:  server/src/models/User.js               ← Fix existing bugs + complete it
Step 6:  server/src/models/RefreshToken.js       ← DB-backed refresh token store (NEW)
Step 7:  server/src/utils/ApiError.js            ← Custom error class
Step 8:  server/src/utils/asyncHandler.js        ← Wraps async controllers
Step 9:  server/src/utils/token.js               ← JWT sign/verify + hashToken helper (UPDATED)
Step 10: server/src/services/authService.js      ← Login, signup, refresh, logout (UPDATED)
Step 11: server/src/controllers/authController.js ← Thin HTTP handlers (+ logout endpoint)
Step 12: server/src/middleware/auth.js            ← verifyToken middleware
Step 13: server/src/middleware/rbac.js            ← requireRole factory
Step 14: server/src/middleware/error.js           ← Central error handler
Step 15: server/src/validators/authValidator.js  ← zod schemas
Step 16: server/src/middleware/validate.js        ← zod middleware wrapper
Step 17: server/src/routes/auth.js               ← /api/auth/* routes (+ POST /logout)
Step 18: server/src/routes/index.js              ← Root router
Step 19: server/src/app.js                       ← Express app setup
Step 20: server/src/server.js                    ← DB connect + listen
Step 21: scripts/seedAdmin.js                    ← Create your Platform Admin account
```

---

# PART 3 — STEP-BY-STEP IMPLEMENTATION

---

## BEFORE YOU START — Fix package.json

Your current `package.json` says `"type": "commonjs"` but the TRD mandates ES Modules. Also, you're missing most dependencies.

**Replace the entire `server/package.json` with this:**

```json
{
  "name": "loyaltyledger-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "seed": "node scripts/seedAdmin.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.0.3",
    "morgan": "^1.10.0",
    "node-cron": "^3.0.3",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "vitest": "^1.0.4",
    "supertest": "^6.3.3"
  }
}
```

Then run: `npm install`

**Why bcryptjs and NOT bcrypt?** `bcrypt` is a native C++ addon — it requires compilation tools (Python, build tools). `bcryptjs` is pure JavaScript — works everywhere, no compilation needed. Same API, virtually same performance for our scale.

---

## STEP 1 — `server/src/config/constants.js`

This file is the single source of truth for all constant values.

```javascript
export const USER_ROLES = {
  PLATFORM_ADMIN:   'PLATFORM_ADMIN',
  MERCHANT_OWNER:   'MERCHANT_OWNER',
  MERCHANT_MANAGER: 'MERCHANT_MANAGER',
  MERCHANT_STAFF:   'MERCHANT_STAFF',
  MEMBER:           'MEMBER',
};

export const TOKEN_CONFIG = {
  ACCESS_EXPIRY:  '15m',
  REFRESH_EXPIRY: '7d',
};

export const BCRYPT_ROUNDS = 12;
```

**Why constants and not magic strings?** If you type `'MERCHANT_OWNER'` in 50 places and later rename it, you'll miss some. If you use `USER_ROLES.MERCHANT_OWNER`, your editor can find all references.

---

## STEP 2 — `server/src/config/env.js`

All environment variables go through this file. If a required variable is missing, the app crashes immediately at startup with a clear message — better than a cryptic error 3 hours later.

```javascript
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const env = {
  NODE_ENV:          process.env.NODE_ENV || 'development',
  PORT:              process.env.PORT || 5000,
  MONGODB_URI:       required('MONGODB_URI'),
  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  CLIENT_ORIGIN:     process.env.CLIENT_ORIGIN || 'http://localhost:5173',
};
```

**Create `server/.env`** (and make sure it's in `.gitignore` — NEVER commit this):

```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://your-username:your-password@cluster.mongodb.net/loyaltyledger?retryWrites=true&w=majority
JWT_ACCESS_SECRET=your-super-secret-access-key-at-least-32-chars
JWT_REFRESH_SECRET=your-different-super-secret-refresh-key-at-least-32-chars
CLIENT_ORIGIN=http://localhost:5173
```

**Generate secure secrets:** In terminal: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`  
Run it twice — one for ACCESS_SECRET, one for REFRESH_SECRET. They must be different.

---

## STEP 3 — `server/src/config/db.js`

```javascript
import mongoose from 'mongoose';
import { env } from './env.js';

const MAX_RETRIES   = 5;
const RETRY_DELAY   = 3000;

export async function connectDB() {
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const conn = await mongoose.connect(env.MONGODB_URI);
      console.log(`MongoDB connected: ${conn.connection.host}`);
      return;
    } catch (err) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        console.error(`MongoDB failed after ${MAX_RETRIES} attempts.`);
        throw err;
      }
      console.warn(`Connection attempt ${attempt} failed. Retrying in ${RETRY_DELAY / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }
}
```

**Concept:** We export a function, not a side-effect. `server.js` will call `connectDB()` before `app.listen()`. This ensures we never accept HTTP requests while the DB is still connecting. Retry logic handles transient Atlas connectivity issues on startup.

---

## STEP 4 — `server/src/models/Tenant.js`

```javascript
import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    plan: {
      type: String,
      enum: ['starter', 'growth', 'enterprise'],
      default: 'starter',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'],
      default: 'active',
    },
    billingEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

tenantSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Tenant = mongoose.model('Tenant', tenantSchema);
```

**Concept — `timestamps: true`:** Mongoose automatically adds `createdAt` and `updatedAt` fields. You never manage them manually.

**Concept — `toJSON` transform:** Whenever Mongoose converts a document to JSON (to send as API response), this runs. We rename `_id` to `id` (more frontend-friendly), remove `__v` (internal Mongoose version key), and remove any sensitive fields.

---

## STEP 5 — `server/src/models/User.js` (Fixed and Complete)

Here is the corrected version. I'll list every bug from your original below.

```javascript
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USER_ROLES, BCRYPT_ROUNDS } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,   // null for PLATFORM_ADMIN
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,   // NEVER returned in queries by default
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.MERCHANT_OWNER,
    },
  },
  { timestamps: true }   // ← was "timeStamp" (wrong) in your original
);

// Compound unique index: same email CAN exist across tenants, but not within one tenant
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });

userSchema.methods.setPassword = async function (plaintext) {
  this.passwordHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
};

userSchema.methods.verifyPassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);  // ← was "bctrypt" (typo) in your original
};

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;  // Always strip — even if someone fetches with .select('+passwordHash')
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
```

**Bugs fixed from your original:**
1. `import bcrypt from 'bcryptjs'` — was missing entirely
2. `import { type } from 'node:os'` — removed (unused, made no sense)
3. `import { timeStamp } from 'node:console'` — removed (unused, made no sense)
4. `{ timeStamp: true }` → `{ timestamps: true }` — Mongoose option is `timestamps`, not `timeStamp`
5. `bctrypt.compare` → `bcrypt.compare` — typo in verifyPassword

**Why `select: false` on passwordHash?** When you do `User.findOne({ email })`, Mongoose will NOT include `passwordHash` in the result. This means even if you forget to strip it, it won't leak. When you explicitly need it (login), you do `User.findOne({ email }).select('+passwordHash')`.

---

## STEP 6 — `server/src/models/RefreshToken.js` (NEW)

This is the model that gives us full control over sessions. One document per active session.

```javascript
import mongoose from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,   // no two records with the same hash
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// TTL index: MongoDB automatically deletes the document once expiresAt passes
// This means expired sessions clean themselves up — no cron job needed
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast lookup when a user logs out of ALL devices
refreshTokenSchema.index({ userId: 1 });

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
```

**Why `tokenHash` and not the raw token?**
If your database is ever breached, the attacker gets only SHA-256 hashes. They cannot reverse a SHA-256 hash to get the original token. The raw token only ever lives on the client and in transit — never at rest on the server.

**Why TTL index instead of a cron job?**
MongoDB's TTL index automatically deletes documents when `expiresAt` is in the past. This means 7-day-old sessions evaporate on their own. Zero maintenance.

**Why `userId` index?**
When a user changes their password or you want to log them out of all devices, you do `RefreshToken.deleteMany({ userId })`. Without the index this would be a full collection scan.

---

## STEP 7 — `server/src/utils/ApiError.js`

```javascript
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}
```

**Concept:** We create a custom error class so we can throw meaningful errors from service functions:

```javascript
throw new ApiError(401, 'Invalid credentials');
throw new ApiError(409, 'Email already registered');
throw new ApiError(403, 'Insufficient permissions');
```

The central error middleware will catch these and format them into our standard error envelope.

---

## STEP 7 — `server/src/utils/asyncHandler.js`

```javascript
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

**Concept — why this exists:**

Without asyncHandler, every async controller needs its own try/catch:
```javascript
// WITHOUT asyncHandler — repetitive and error-prone
async function loginController(req, res, next) {
  try {
    const result = await authService.login(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);  // you MUST call next(err) or Express won't catch it
  }
}
```

With asyncHandler, you wrap once and forget try/catch:
```javascript
// WITH asyncHandler — clean
export const loginController = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json({ success: true, data: result });
});
// Any thrown error is automatically passed to next(err)
```

**How it works:** `asyncHandler` returns a new function that wraps your async function. When the async function throws, `.catch(next)` automatically calls Express's `next` with the error, sending it to the error middleware.

---

## STEP 9 — `server/src/utils/token.js` (UPDATED — adds hashToken)

```javascript
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { TOKEN_CONFIG } from '../config/constants.js';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: TOKEN_CONFIG.ACCESS_EXPIRY,
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: TOKEN_CONFIG.REFRESH_EXPIRY,
  });
}

export function verifyAccessToken(token) {
  // jwt.verify throws if token is invalid or expired — let it bubble up to auth middleware
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

// Hash a raw refresh token before storing/looking it up in the DB.
// SHA-256 is fast (good — called on every refresh/logout) and one-way (good — DB breach safety).
// NOT bcrypt — bcrypt's slowness is for passwords (brute-force resistance). 
// Refresh tokens are long random strings, not guessable — speed is fine here.
export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
```

**Why two different secrets for access and refresh tokens?**
If the same secret was used for both, a vulnerability that exposes the access secret would also let an attacker forge refresh tokens (7-day lifetime). Separate secrets = separate blast radius.

**What `jwt.verify` does:**
1. Splits the token into header + payload + signature
2. Recomputes the signature using the secret
3. If it doesn't match → throws `JsonWebTokenError`
4. Checks expiry → if expired → throws `TokenExpiredError`
5. If everything is fine → returns decoded payload

---

## STEP 10 — `server/src/services/authService.js` (UPDATED — DB-backed refresh tokens)

This is the brain of authentication. All logic lives here. No `req` or `res` — just data in, data out.

```javascript
import mongoose from 'mongoose';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import RefreshToken from '../models/RefreshToken.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../utils/token.js';
import { ApiError } from '../utils/ApiError.js';
import { USER_ROLES, TOKEN_CONFIG } from '../config/constants.js';

// ─── HELPER: calculate expiry date for the refresh token DB record ──────────
// Must match TOKEN_CONFIG.REFRESH_EXPIRY ('7d') exactly
function refreshExpiresAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
}

// ─── HELPER: sign both tokens + persist refresh token hash in DB ────────────
async function issueTokens(user, session = null) {
  const accessPayload  = { userId: user._id, tenantId: user.tenantId, role: user.role };
  const refreshPayload = { userId: user._id };

  const accessToken  = signAccessToken(accessPayload);
  const refreshToken = signRefreshToken(refreshPayload);
  const tokenHash    = hashToken(refreshToken);

  const record = {
    userId:    user._id,
    tokenHash,
    expiresAt: refreshExpiresAt(),
  };

  // If we're inside a transaction (signup), save the refresh token inside it
  if (session) {
    await RefreshToken.create([record], { session });
  } else {
    await RefreshToken.create(record);
  }

  return { accessToken, refreshToken };
}

// ─── LOGIN ──────────────────────────────────────────────────────────────────

export async function login({ email, password }) {
  // 1. Find user by email — need passwordHash, so .select('+passwordHash')
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');

  // 2. Generic error — never reveal whether email exists or password is wrong.
  //    Both cases return identical message. Prevents user enumeration attacks.
  if (!user) throw new ApiError(401, 'Invalid credentials');

  const valid = await user.verifyPassword(password);
  if (!valid) throw new ApiError(401, 'Invalid credentials');

  // 3. Issue tokens and save refresh token hash to DB
  const tokens = await issueTokens(user);

  // Return user without passwordHash (toJSON transform handles this)
  return { user, ...tokens };
}

// ─── MERCHANT SIGNUP ────────────────────────────────────────────────────────

export async function signup({ businessName, ownerName, email, password, plan }) {
  // Fast fail before starting transaction
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with this email already exists');

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const slug = businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

      const existingTenant = await Tenant.findOne({ slug }).session(session);
      if (existingTenant) throw new ApiError(409, 'Business name already taken');

      const [tenant] = await Tenant.create(
        [{ businessName, slug, plan: plan || 'starter', billingEmail: email }],
        { session }
      );

      const [user] = await User.create(
        [{ tenantId: tenant._id, name: ownerName, email: email.toLowerCase(), role: USER_ROLES.MERCHANT_OWNER }],
        { session }
      );

      await user.setPassword(password);
      await user.save({ session });

      // Refresh token record created inside the same transaction
      // If anything fails, the RefreshToken record is also rolled back
      const tokens = await issueTokens(user, session);

      result = { user, tenant, ...tokens };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// ─── REFRESH ─────────────────────────────────────────────────────────────────

export async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) throw new ApiError(401, 'Refresh token required');

  // Step 1: Verify the JWT signature and expiry
  // If forged or expired → throws → caught by asyncHandler → 401
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  // Step 2: Look up the hash in the DB — proves this exact token was issued by us
  const tokenHash = hashToken(rawRefreshToken);
  const stored    = await RefreshToken.findOne({ tokenHash });

  if (!stored) {
    // Token was already used (rotation) or was explicitly revoked (logout)
    // Could also mean an attacker is replaying a stolen token after the real user refreshed
    // Option: also nuke ALL sessions for this user here for maximum security:
    // await RefreshToken.deleteMany({ userId: payload.userId });
    throw new ApiError(401, 'Refresh token not recognised — please log in again');
  }

  // Step 3: Fetch fresh user data — roles/tenantId may have changed since the token was issued
  const user = await User.findById(payload.userId);
  if (!user) throw new ApiError(401, 'User no longer exists');

  // Step 4: ROTATION — delete the old record so this token can never be used again
  await RefreshToken.deleteOne({ _id: stored._id });

  // Step 5: Issue a brand new pair and persist the new hash
  const tokens = await issueTokens(user);
  return tokens;
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────

export async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return; // Already logged out — idempotent
  const tokenHash = hashToken(rawRefreshToken);
  await RefreshToken.deleteOne({ tokenHash });
  // No error if not found — idempotent logout
}

// ─── LOGOUT ALL DEVICES ───────────────────────────────────────────────────────

export async function logoutAll(userId) {
  await RefreshToken.deleteMany({ userId });
}
```

**Key concepts in this implementation:**

**`issueTokens` persists inside a transaction (signup):** When a merchant signs up, we create Tenant + User + RefreshToken in one atomic transaction. If User creation fails, the RefreshToken record is also rolled back. No orphaned sessions.

**`refresh` is two-factor:** JWT verification (cryptographic) AND DB lookup (revocability). Both must pass. This is why this pattern is far stronger than JWT-only refresh.

**Rotation in `refresh`:** We `deleteOne` before creating the new record. Even if the response never reaches the client (network error), the old token is gone. The client can simply call `/auth/login` again. This is the safe trade-off.

**`logout` is idempotent:** If the client calls logout twice (e.g., network retry), the second call finds no record and does nothing. No error. This is correct behaviour.

**Why re-fetch user on refresh?** If you promote a staff member to manager, their old access token has the old role for up to 15 minutes. That's acceptable. But when they refresh, we re-query the DB for the current role — the new access token will have the updated role. This keeps data consistent without real-time token invalidation.

---

## STEP 11 — `server/src/controllers/authController.js` (UPDATED — adds logout)

Thin handlers. No logic. Read req → call service → write res.

```javascript
import * as authService from '../services/authService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  res.status(200).json({
    success: true,
    data: { user, accessToken, refreshToken },
  });
});

export const signup = asyncHandler(async (req, res) => {
  const { user, tenant, accessToken, refreshToken } = await authService.signup(req.body);
  res.status(201).json({
    success: true,
    data: { user, tenant, accessToken, refreshToken },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.status(200).json({ success: true, data: tokens });
});

export const logout = asyncHandler(async (req, res) => {
  // Delete this session's refresh token from DB
  await authService.logout(req.body.refreshToken);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const logoutAll = asyncHandler(async (req, res) => {
  // Delete ALL sessions for this user (requires valid access token — uses req.user)
  await authService.logoutAll(req.user.userId);
  res.status(200).json({ success: true, message: 'Logged out from all devices' });
});

export const me = asyncHandler(async (req, res) => {
  // req.user is set by auth middleware
  res.status(200).json({ success: true, data: { user: req.user } });
});
```

---

## STEP 11 — `server/src/middleware/auth.js`

```javascript
import { verifyAccessToken } from '../utils/token.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

export async function authenticate(req, _res, next) {
  try {
    // 1. Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(401, 'No token provided');
    }
    const token = authHeader.slice(7);  // Remove "Bearer " prefix

    // 2. Verify the JWT — throws if invalid/expired
    const payload = verifyAccessToken(token);

    // 3. Attach user identity to the request object
    //    Controllers and subsequent middleware use req.user
    req.user = {
      userId:   payload.userId,
      tenantId: payload.tenantId,
      role:     payload.role,
    };

    next();
  } catch (err) {
    // Convert JWT library errors to our ApiError format
    if (err instanceof ApiError) return next(err);
    if (err.name === 'TokenExpiredError') return next(new ApiError(401, 'Token expired'));
    next(new ApiError(401, 'Invalid token'));
  }
}
```

**Concept — `req.user`:** Express `req` is just a plain JavaScript object. You can attach any properties to it. Middleware runs in sequence, and each middleware receives the same `req` object. So `authenticate` attaches `req.user`, and all subsequent middleware and controllers can read it. This is the standard pattern for passing user identity through the request lifecycle.

---

## STEP 12 — `server/src/middleware/rbac.js`

```javascript
import { ApiError } from '../utils/ApiError.js';

// Factory function — returns a middleware with the allowed roles baked in
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    next();
  };
}
```

**Usage in routes:**
```javascript
// Only MERCHANT_OWNER can create staff accounts
router.post('/users/staff', authenticate, requireRole('MERCHANT_OWNER'), createStaff);

// Owner and Manager can view members
router.get('/members', authenticate, requireRole('MERCHANT_OWNER', 'MERCHANT_MANAGER'), listMembers);

// Platform Admin only
router.get('/platform/tenants', authenticate, requireRole('PLATFORM_ADMIN'), listTenants);
```

**Concept — Factory pattern:** `requireRole` is not a middleware — it's a function that RETURNS a middleware. This lets you parameterize the allowed roles per route at definition time. When Express calls the returned function, `allowedRoles` is captured in the closure.

---

## STEP 13 — `server/src/middleware/error.js`

```javascript
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export function errorMiddleware(err, req, res, _next) {
  // Default to 500 for unexpected errors
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const message    = err instanceof ApiError ? err.message : 'Internal server error';

  // Log the full error in development, just the message in production
  if (env.NODE_ENV === 'development' || statusCode === 500) {
    console.error(`[ERROR] ${req.method} ${req.url}`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details && { details: err.details }),
    ...(env.NODE_ENV === 'development' && statusCode === 500 && { stack: err.stack }),
  });
}
```

**Concept — Express error middleware:** In Express, a middleware with FOUR parameters `(err, req, res, next)` is an error handler. When any middleware or controller calls `next(someError)`, Express skips all normal middleware and goes straight to this function. This is why `asyncHandler` calls `next(err)` on catch — it routes the error here.

---

## STEP 14 — `server/src/validators/authValidator.js`

```javascript
import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  ownerName:    z.string().min(2, 'Name must be at least 2 characters'),
  email:        z.string().email('Invalid email format'),
  password:     z.string().min(8, 'Password must be at least 8 characters'),
  plan:         z.enum(['starter', 'growth', 'enterprise']).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
```

---

## STEP 15 — `server/src/middleware/validate.js`

```javascript
import { ApiError } from '../utils/ApiError.js';

// Factory: takes a zod schema, returns a middleware
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(new ApiError(400, 'Validation failed', details));
    }
    req.body = result.data;  // Replace body with sanitized/coerced data
    next();
  };
}
```

---

## STEP 17 — `server/src/routes/auth.js` (UPDATED — adds logout routes)

```javascript
import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, signupSchema, refreshSchema } from '../validators/authValidator.js';

const router = Router();

// POST /api/auth/login
router.post('/login',   validate(loginSchema),   authController.login);

// POST /api/auth/signup
router.post('/signup',  validate(signupSchema),  authController.signup);

// POST /api/auth/refresh — rotates refresh token (old hash deleted, new hash saved)
router.post('/refresh', validate(refreshSchema), authController.refresh);

// POST /api/auth/logout — deletes this session's refresh token from DB
// Client sends the refresh token in body so we can hash + delete it
router.post('/logout',  validate(refreshSchema), authController.logout);

// POST /api/auth/logout-all — deletes ALL sessions for this user (requires access token)
router.post('/logout-all', authenticate, authController.logoutAll);

// GET /api/auth/me — returns current user from access token
router.get('/me', authenticate, authController.me);

export default router;
```

**Design note on logout:** The client sends the refresh token in the logout request body so the server can hash it and delete that specific record. The access token is NOT sent — it doesn't need to be, because it will expire on its own in max 15 minutes. This is the correct, pragmatic trade-off for stateless access tokens.

---

## STEP 17 — `server/src/routes/index.js`

```javascript
import { Router } from 'express';
import authRouter from './auth.js';

const router = Router();

router.use('/auth', authRouter);

// Future routes plug in here:
// router.use('/members', authenticate, membersRouter);
// router.use('/programs', authenticate, programsRouter);
// router.use('/platform', authenticate, requireRole('PLATFORM_ADMIN'), platformRouter);

export default router;
```

---

## STEP 18 — `server/src/app.js`

```javascript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import router from './routes/index.js';
import { errorMiddleware } from './middleware/error.js';

const app = express();

// Security headers
app.use(helmet());

// CORS — only allow requests from the React client
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));

// Parse JSON bodies
app.use(express.json());

// Request logging (dev only)
if (env.NODE_ENV === 'development') app.use(morgan('dev'));

// Rate limiting on auth routes (max 20 attempts per 15 minutes per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use('/api/auth', authLimiter);

// Health check (no auth required)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// All API routes
app.use('/api', router);

// Central error handler (MUST be last, after all routes)
app.use(errorMiddleware);

export default app;
```

---

## STEP 19 — `server/src/server.js`

```javascript
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import app from './app.js';

async function start() {
  await connectDB();              // Connect to DB FIRST
  app.listen(env.PORT, () => {   // Then start accepting requests
    console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

**Concept:** `app.js` builds the Express app (no `listen`). `server.js` connects the DB then starts listening. Tests can import `app` directly without starting the server or connecting the DB. This separation is the standard pattern for testable Node servers.

---

## STEP 20 — `server/scripts/seedAdmin.js`

You (the Platform Admin) need a way to create your account without going through the public signup flow. A seed script solves this.

```javascript
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { USER_ROLES } from '../src/config/constants.js';

const ADMIN_EMAIL    = 'info@monilcorpus.com';  // your email
const ADMIN_NAME     = 'Vaibhav Pandey';
const ADMIN_PASSWORD = 'ChangeThisPassword123!'; // change immediately after first login

async function seed() {
  await connectDB();

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log('Platform Admin already exists. Skipping.');
    await mongoose.disconnect();
    return;
  }

  const admin = new User({
    tenantId: null,                    // Platform Admin has no tenant
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    role: USER_ROLES.PLATFORM_ADMIN,
    passwordHash: 'placeholder',       // Will be overwritten below
  });

  await admin.setPassword(ADMIN_PASSWORD);
  await admin.save();

  console.log(`Platform Admin created: ${ADMIN_EMAIL}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

Run with: `npm run seed`

---

# PART 4 — TESTING YOUR AUTH SYSTEM

Once everything is wired up, test in this order. Each test has an expected result — verify before moving to the next.

```bash
# 1. Start the server
npm run dev

# 2. Seed the admin
npm run seed

# 3. Admin login — check Atlas: RefreshToken collection should have 1 document
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"info@monilcorpus.com","password":"ChangeThisPassword123!"}'
# Expected: { success: true, data: { user, accessToken, refreshToken } }
# Check Atlas: db.refreshtokens.find() → 1 document with tokenHash

# 4. Merchant signup
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Zest Cafe","ownerName":"Raj Kumar","email":"raj@zestcafe.com","password":"SecurePass123!"}'
# Expected: 201 with tenant + tokens
# Check Atlas: 1 Tenant doc + 1 User doc + 1 RefreshToken doc (all created atomically)

# 5. Protected route — use accessToken from step 3 or 4
ACCESS="<paste_access_token>"
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $ACCESS"
# Expected: 200 with user object

# 6. Refresh — old hash deleted, new hash saved in DB
REFRESH="<paste_refresh_token>"
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
# Expected: 200 with NEW accessToken and NEW refreshToken
# Check Atlas: old tokenHash is gone, new tokenHash exists

# 7. Try to use the OLD refresh token again (rotation test)
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH\"}"
# Expected: 401 "Refresh token not recognised" — old token is dead

# 8. Logout — hash deleted from DB
NEW_REFRESH="<paste new refreshToken from step 6>"
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$NEW_REFRESH\"}"
# Expected: 200 "Logged out successfully"
# Check Atlas: RefreshToken collection has 0 documents for this user

# 9. Try to use the logged-out refresh token
curl -X POST http://localhost:5000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$NEW_REFRESH\"}"
# Expected: 401 — token is dead, even if JWT expiry hasn't passed yet
# THIS IS THE POWER OF DB-BACKED REFRESH TOKENS

# 10. No token → 401
curl http://localhost:5000/api/auth/me
# Expected: 401 "No token provided"

# 11. Bad credentials → 401 (same message whether email or password is wrong)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"wrong@email.com","password":"wrongpass"}'
# Expected: 401 "Invalid credentials"
```

---

# PART 5 — INTERVIEW CHEAT SHEET

**Q: What is a JWT?**
> A JWT is a stateless token with three parts: header (algo), payload (claims), signature. The signature is an HMAC hash of header+payload using a server secret. Any modification to the payload invalidates the signature. The server can verify tokens without a DB lookup — enabling stateless, horizontally scalable auth.

**Q: Why access token + refresh token?**
> Short-lived access tokens (15min) minimize the window of damage from theft — stateless, no DB hit per request. Refresh tokens (7 days) maintain long sessions and are stored as SHA-256 hashes in DB, giving us full revocation control. Rotation detects stolen tokens — if a stolen token is used, the hash is consumed, and the real user's next refresh detects reuse.

**Q: Where do you store the refresh token and why?**
> The raw refresh token is sent to the client and stored in memory or secure storage. On the server, we store only a SHA-256 hash of it in the `RefreshToken` collection. This means a DB breach gives an attacker only hashes — useless without the raw tokens. Access tokens are never stored anywhere on the server — they're verified purely cryptographically on every request.

**Q: How do you implement logout with JWTs?**
> Access tokens are stateless — you can't truly revoke them before expiry. We accept this: they're short-lived (15min), so the risk window is small. For refresh tokens, logout deletes the hash from DB. Even if the attacker has a copy of the raw token, the hash is gone and the next refresh call returns 401. True session termination happens at the refresh token level.

**Q: Why bcrypt and not SHA-256?**
> SHA-256 is fast — attackers can compute billions of hashes/second. bcrypt is intentionally slow (configurable cost factor) and automatically salts the password, making brute-force and rainbow table attacks impractical.

**Q: How do you prevent cross-tenant data leaks in a multi-tenant system?**
> Two layers: (1) The JWT contains a signed tenantId that cannot be forged. (2) Every service function receives tenantId as an explicit argument and includes it in every DB query filter. Neither layer alone is sufficient — defense in depth.

**Q: What is `select: false` in Mongoose?**
> It excludes the field from all queries by default. Even if you forget to strip it before sending a response, it won't be included. You must explicitly opt-in with `.select('+fieldName')` when you need it (like during password verification).

**Q: What does asyncHandler do?**
> It's a higher-order function that wraps async route handlers. It resolves the promise and forwards any rejection to Express's `next(err)`, eliminating try/catch boilerplate in every controller and ensuring all async errors reach the central error middleware.

**Q: How does RBAC work in Express?**
> A middleware factory `requireRole(...roles)` returns a middleware that reads `req.user.role` (set by auth middleware earlier in the chain). If the role isn't in the allowed list, it calls `next(new ApiError(403, ...))` and the request is rejected. The pattern is: authenticate first → authorize second.

**Q: What is the difference between 401 and 403?**
> 401 Unauthorized: the request lacks valid authentication credentials — you don't know who this is.  
> 403 Forbidden: the request has valid credentials but this user doesn't have permission — we know who you are, but you can't do this.

**Q: Why separate app.js from server.js?**
> Tests can import `app` and run requests via Supertest without binding to a port or connecting to a real database. `server.js` handles the runtime concerns (DB connection, port binding). This separation makes integration tests fast and side-effect-free.

---

# PART 6 — WHAT COMES AFTER AUTH

Once auth is working end-to-end, the next layers to build in order:

1. **Member model + CRUD** (the loyalty customers)
2. **Program model + Tier model** (the loyalty program structure)
3. **LedgerEntry model** (the append-only point transaction log)
4. **Earn flow** (POS scans, points calculated, ledger written, member balance updated — all in one transaction)
5. **Redeem flow** (check balance → write ledger debit → update balance → record redemption — all in one transaction with idempotency key)
6. **Analytics** (pre-aggregated summaries)
7. **Billing** (subscription metering + invoicing)
8. **Background jobs** (tier recompute, expiry, invoicing)
9. **React frontend**

The auth system you build here is the foundation every one of those layers will depend on. Get it right first.
