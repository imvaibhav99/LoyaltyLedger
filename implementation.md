# LoyaltyLedger — Implementation Plan
### Build exactly in this order. Each step is a working, testable checkpoint.

> Rule: never move to the next step until the current one runs without error.
> Stack: Node 20, Express 4, ESM (`"type":"module"`), Mongoose 8, MongoDB Atlas, React 18 + Vite + Tailwind, JWT, bcryptjs, zod, node-cron.

---

## Phase 0 — Project Setup (30 min)

### Step 0.1 — Fix `server/package.json`

Replace entire file:

```json
{
  "name": "loyaltyledger-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev":   "node --watch src/server.js",
    "start": "node src/server.js",
    "seed":  "node scripts/seedAdmin.js"
  },
  "dependencies": {
    "bcryptjs":           "^2.4.3",
    "cors":               "^2.8.5",
    "express":            "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet":             "^7.1.0",
    "jsonwebtoken":       "^9.0.2",
    "mongoose":           "^8.0.3",
    "morgan":             "^1.10.0",
    "node-cron":          "^3.0.3",
    "zod":                "^3.22.4"
  }
}
```

Then: `cd server && npm install`

### Step 0.2 — Create folder structure

```bash
mkdir -p server/src/{config,models,controllers,services,middleware,routes,validators,jobs,utils}
mkdir -p server/scripts
```

### Step 0.3 — Create `server/.env`

```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/loyaltyledger?retryWrites=true&w=majority
JWT_ACCESS_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<run again — must be a different value>
CLIENT_ORIGIN=http://localhost:5173
PLATFORM_ADMIN_EMAIL=info@monilcorpus.com
PLATFORM_ADMIN_PASSWORD=ChangeThis123!
```

Add to `.gitignore`:
```
server/.env
server/node_modules/
client/node_modules/
```

---

## Phase 1 — Core Infrastructure (1–2 hours)

No routes yet. Just the foundation. Build in this exact order.

### Step 1.1 — `server/src/config/constants.js`

Copy verbatim from `schema.md § Complete constants.js`. This file is the single source of truth for all enums, roles, and config values.

**Verify:** `node -e "import('./src/config/constants.js').then(m => console.log(Object.keys(m)))"` — no errors.

### Step 1.2 — `server/src/config/env.js`

```javascript
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const env = {
  NODE_ENV:           process.env.NODE_ENV || 'development',
  PORT:               parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI:        required('MONGODB_URI'),
  JWT_ACCESS_SECRET:  required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  CLIENT_ORIGIN:      process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  PLATFORM_ADMIN_EMAIL:    process.env.PLATFORM_ADMIN_EMAIL,
  PLATFORM_ADMIN_PASSWORD: process.env.PLATFORM_ADMIN_PASSWORD,
};
```

### Step 1.3 — `server/src/config/db.js`

```javascript
import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  const conn = await mongoose.connect(env.MONGODB_URI);
  console.log(`MongoDB connected: ${conn.connection.host}`);
}
```

### Step 1.4 — `server/src/utils/ApiError.js`

```javascript
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}
```

### Step 1.5 — `server/src/utils/asyncHandler.js`

```javascript
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

### Step 1.6 — `server/src/utils/token.js`

```javascript
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signAccessToken  = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET,  { expiresIn: '15m' });
export const signRefreshToken = (payload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
export const verifyAccessToken  = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET);
export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET);
```

### Step 1.7 — `server/src/utils/generateId.js`

```javascript
import crypto from 'node:crypto';

// generateId('MBR') → "MBR-A1B2C3D4"
export function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
```

### Step 1.8 — `server/src/utils/calculateExpiry.js`

Port directly from `B2C: helpers/getDurationTime.js` — converts a durationType string + duration number into a JS Date:

```javascript
export function calculateExpiry(durationType, duration) {
  const d = new Date();
  switch (durationType) {
    case 'DAILY':           d.setDate(d.getDate() + duration);            break;
    case 'MONTHLY':         d.setMonth(d.getMonth() + duration);          break;
    case 'QUARTERLY':       d.setMonth(d.getMonth() + duration * 3);      break;
    case 'HALF_YEARLY':     d.setMonth(d.getMonth() + 6 * duration);      break;
    case 'CALENDER_YEARLY': d.setFullYear(d.getFullYear() + duration);    break;
    case 'FINANCIAL_YEARLY': {
      const year = d.getMonth() >= 3
        ? d.getFullYear() + duration
        : d.getFullYear() + duration - 1;
      d.setFullYear(year, 2, 31); // March 31
      break;
    }
    default: throw new Error(`Unknown durationType: ${durationType}`);
  }
  return d;
}
```

### Step 1.9 — `server/src/middleware/error.js`

```javascript
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export function errorMiddleware(err, req, res, _next) {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const message    = err instanceof ApiError ? err.message    : 'Internal server error';
  if (statusCode === 500) console.error(`[ERROR] ${req.method} ${req.url}`, err);
  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details && { details: err.details }),
    ...(env.NODE_ENV === 'development' && statusCode === 500 && { stack: err.stack }),
  });
}
```

### Step 1.10 — `server/src/app.js`

```javascript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorMiddleware } from './middleware/error.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
if (env.NODE_ENV === 'development') app.use(morgan('dev'));

app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, message: 'Too many requests' } }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Routes — uncomment as you complete each phase:
// import router from './routes/index.js';
// app.use('/api', router);

app.use(errorMiddleware);
export default app;
```

### Step 1.11 — `server/src/server.js`

```javascript
import 'dotenv/config';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import app from './app.js';

async function start() {
  await connectDB();
  app.listen(env.PORT, () =>
    console.log(`Server on port ${env.PORT} [${env.NODE_ENV}]`)
  );
}
start().catch((err) => { console.error('Startup failed:', err); process.exit(1); });
```

> Install dotenv: `npm install dotenv`

**Checkpoint:** `npm run dev` → prints "MongoDB connected" + "Server on port 5000".
`curl http://localhost:5000/health` → `{"status":"ok"}`

---

## Phase 2 — All Models (1–2 hours)

Copy each schema from `schema.md`. One file per model. Do NOT invent field names — use exactly what's in schema.md.

```
server/src/models/
  Tenant.js         ← schema.md §1
  User.js           ← schema.md §2  (overwrite the buggy existing file)
  Member.js         ← schema.md §3
  Wallet.js         ← schema.md §4
  LedgerEntry.js    ← schema.md §5
  Tier.js           ← schema.md §6
  UserTier.js       ← schema.md §7
  UserTierLog.js    ← schema.md §8
  EarnRule.js       ← schema.md §9
  Order.js          ← schema.md §10
  Store.js          ← schema.md §11
  Role.js           ← schema.md §12
  IdempotencyKey.js ← schema.md §13
  AuditLog.js       ← schema.md §14
```

**Checkpoint:** Add to `server.js` temporarily:
```javascript
import './models/Tenant.js';
import './models/User.js';
// ... all 14
```
`npm run dev` — zero errors means all schemas are valid. Remove the imports after.

---

## Phase 3 — Auth System (2–3 hours)

### Step 3.1 — `server/src/middleware/auth.js`

```javascript
import { verifyAccessToken } from '../utils/token.js';
import { ApiError } from '../utils/ApiError.js';

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'No token provided');
    const payload = verifyAccessToken(header.slice(7));
    req.user = { userId: payload.userId, tenantId: payload.tenantId, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    if (err.name === 'TokenExpiredError') return next(new ApiError(401, 'Token expired'));
    next(new ApiError(401, 'Invalid token'));
  }
}
```

### Step 3.2 — `server/src/middleware/rbac.js`

```javascript
import { ApiError } from '../utils/ApiError.js';
import User from '../models/User.js';

// Usage: requireRole('PLATFORM_ADMIN') or requireRole('MERCHANT_OWNER','MERCHANT_MANAGER')
export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!allowedRoles.includes(req.user.role))
      return next(new ApiError(403, 'Insufficient permissions'));
    next();
  };
}

// Usage: requirePermission('members', 'read')
// PLATFORM_ADMIN and MERCHANT_OWNER always pass — only MANAGER/STAFF hit the Role.access[] check
export function requirePermission(module, action) {
  return async (req, _res, next) => {
    try {
      const { role, userId } = req.user;
      if (role === 'PLATFORM_ADMIN' || role === 'MERCHANT_OWNER') return next();
      const user = await User.findById(userId).populate('roleId');
      if (!user?.roleId) return next(new ApiError(403, 'No role assigned'));
      const perm = user.roleId.access.find((a) => a.module === module);
      if (!perm || !perm[action]) return next(new ApiError(403, 'Permission denied'));
      next();
    } catch (err) {
      next(err);
    }
  };
}
```

### Step 3.3 — `server/src/middleware/validate.js`

```javascript
import { ApiError } from '../utils/ApiError.js';

export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(new ApiError(400, 'Validation failed', details));
    }
    req.body = result.data;
    next();
  };
}
```

### Step 3.4 — `server/src/validators/authValidator.js`

```javascript
import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

export const signupSchema = z.object({
  businessName: z.string().min(2),
  ownerName:    z.string().min(2),
  email:        z.string().email(),
  password:     z.string().min(8),
  plan:         z.enum(['starter', 'growth', 'enterprise']).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
```

### Step 3.5 — `server/src/services/authService.js`

```javascript
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/token.js';
import { ApiError } from '../utils/ApiError.js';

function buildTokens(user, tenantId) {
  const payload = { userId: user._id, tenantId, role: user.role };
  return {
    accessToken:  signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw new ApiError(401, 'Invalid credentials');
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new ApiError(401, 'Invalid credentials');
  const tokens = buildTokens(user, user.tenantId);
  const safe = user.toObject();
  delete safe.passwordHash;
  return { user: safe, ...tokens };
}

export async function signup({ businessName, ownerName, email, password }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existing = await User.findOne({ email: email.toLowerCase() }).session(session);
      if (existing) throw new ApiError(409, 'Email already in use');
      const [tenant] = await Tenant.create([{ name: businessName }], { session });
      const hash = await bcrypt.hash(password, 12);
      const [user] = await User.create([{
        tenantId:     tenant._id,
        name:         ownerName,
        email:        email.toLowerCase(),
        passwordHash: hash,
        role:         'MERCHANT_OWNER',
      }], { session });
      const tokens = buildTokens(user, tenant._id);
      const safe = user.toObject();
      delete safe.passwordHash;
      result = { user: safe, tenant, ...tokens };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function refresh(refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
  const tokens = buildTokens({ _id: payload.userId, role: payload.role }, payload.tenantId);
  return tokens;
}
```

### Step 3.6 — `server/src/controllers/authController.js`

```javascript
import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/authService.js';
import User from '../models/User.js';

export const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body);
  res.json({ success: true, data });
});

export const signup = asyncHandler(async (req, res) => {
  const data = await authService.signup(req.body);
  res.status(201).json({ success: true, data });
});

export const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refresh(req.body.refreshToken);
  res.json({ success: true, data });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId).populate('roleId');
  if (!user) throw new ApiError(401, 'User not found');
  res.json({ success: true, data: { user } });
});
```

### Step 3.7 — `server/src/routes/auth.js`

```javascript
import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, signupSchema, refreshSchema } from '../validators/authValidator.js';

const router = Router();
router.post('/login',   validate(loginSchema),   authController.login);
router.post('/signup',  validate(signupSchema),  authController.signup);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.get('/me',       authenticate,            authController.me);
export default router;
```

### Step 3.8 — `server/src/routes/index.js`

```javascript
import { Router } from 'express';
import authRouter from './auth.js';
const router = Router();
router.use('/auth', authRouter);
export default router;
```

### Step 3.9 — Wire router in `app.js`

Uncomment the two lines in `app.js`:
```javascript
import router from './routes/index.js';
app.use('/api', router);
```

### Step 3.10 — `server/scripts/seedAdmin.js`

```javascript
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env.js';
import User from '../src/models/User.js';

await mongoose.connect(env.MONGODB_URI);

const existing = await User.findOne({ role: 'PLATFORM_ADMIN' });
if (existing) {
  console.log('Platform admin already exists:', existing.email);
  process.exit(0);
}

const hash = await bcrypt.hash(env.PLATFORM_ADMIN_PASSWORD, 12);
await User.create({
  name:         'Platform Admin',
  email:        env.PLATFORM_ADMIN_EMAIL,
  passwordHash: hash,
  role:         'PLATFORM_ADMIN',
});

console.log('Platform admin created:', env.PLATFORM_ADMIN_EMAIL);
await mongoose.disconnect();
```

Run: `npm run seed`

**Checkpoint after Phase 3:**
```bash
# 1. Seed admin
npm run seed

# 2. Admin login
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"info@monilcorpus.com","password":"ChangeThis123!"}' | jq .
# → 200 { success:true, data:{ user, accessToken, refreshToken } }

# 3. Merchant signup
curl -s -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"businessName":"Zest Cafe","ownerName":"Raj Kumar","email":"raj@zestcafe.com","password":"SecurePass123!"}' | jq .
# → 201 with tenant + tokens

# 4. /me
curl -s http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>" | jq .
# → 200 with user object (no passwordHash)

# 5. /me without token → 401
curl -s http://localhost:5000/api/auth/me | jq .
```

---

## Phase 4 — Member + Store (2 hours)

### Step 4.1 — `server/src/validators/memberValidator.js`

```javascript
import { z } from 'zod';

export const createMemberSchema = z.object({
  name:    z.string().min(2),
  phone:   z.string().min(10).max(15),
  email:   z.string().email().optional(),
  dob:     z.string().optional(),
  gender:  z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  storeId: z.string().optional(),
  address: z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  pinCode: z.string().regex(/^\d{6}$/).optional(),
});

export const updateMemberSchema = createMemberSchema.partial();
```

### Step 4.2 — `server/src/services/memberService.js`

Function signatures (implement body for each):

```javascript
// createMember({ tenantId, actorId, name, phone, email, dob, gender, storeId, ... })
//   1. Check Member.findOne({ tenantId, phone }) → 409 if exists
//   2. session.withTransaction():
//      a. Generate memberId = generateId('MBR')
//      b. Member.create([{ tenantId, memberId, name, phone, ... }], { session })
//      c. Find default Tier for this tenant (isDefault: true)
//      d. Wallet.create([{ tenantId, memberId: member._id }], { session })
//      e. UserTier.create([{ tenantId, memberId: member._id, tierId: defaultTier._id,
//                            ...(tier has duration: { tierExpiryDate: calculateExpiry(...) }) }], { session })
//      f. AuditLog.create([{ tenantId, actorId, action:'MEMBER_CREATED', ... }], { session })
//   Returns: { member, wallet }

// getMember({ tenantId, memberId })
//   Member.findOne({ _id: memberId, tenantId }).lean()
//   + Wallet.findOne({ memberId }) for balance
//   + UserTier populated with Tier name
//   Returns: { member, balance, tier }

// listMembers({ tenantId, search, status, cursor, limit = 20 })
//   Cursor-based: find({ tenantId, ...(cursor && { _id: { $gt: cursor } }) })
//   .sort({ _id: 1 }).limit(limit + 1)
//   If search: add $or: [{ name: /regex/ }, { phone: /regex/ }]
//   Returns: { data, nextCursor }

// updateMember({ tenantId, memberId, actorId, updates })
//   Member.findOneAndUpdate({ _id: memberId, tenantId }, updates, { new: true })
//   AuditLog
//   Returns: { member }
```

### Step 4.3 — `server/src/controllers/memberController.js`

Pattern for every handler:
```javascript
import { asyncHandler } from '../utils/asyncHandler.js';
import * as memberService from '../services/memberService.js';

export const createMember = asyncHandler(async (req, res) => {
  const data = await memberService.createMember({
    tenantId: req.user.tenantId,
    actorId:  req.user.userId,
    ...req.body,
  });
  res.status(201).json({ success: true, data });
});
// ... listMembers, getMember, updateMember
```

### Step 4.4 — `server/src/routes/members.js`

```javascript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createMemberSchema, updateMemberSchema } from '../validators/memberValidator.js';
import * as ctrl from '../controllers/memberController.js';

const router = Router();
router.use(authenticate);

router.get('/',    requirePermission('members', 'read'),  ctrl.listMembers);
router.post('/',   validate(createMemberSchema), requirePermission('members', 'write'), ctrl.createMember);
router.get('/:id', requirePermission('members', 'read'),  ctrl.getMember);
router.put('/:id', validate(updateMemberSchema), requirePermission('members', 'write'), ctrl.updateMember);

export default router;
```

### Step 4.5 — Repeat for Stores

Same exact pattern:
- `validators/storeValidator.js` — name, address, city, state, pinCode, phone, managerId
- `services/storeService.js` — createStore, listStores, getStore, updateStore (all scoped by tenantId)
- `controllers/storeController.js`
- `routes/stores.js`

### Step 4.6 — Mount in `routes/index.js`

```javascript
import membersRouter from './members.js';
import storesRouter  from './stores.js';
router.use('/members', membersRouter);
router.use('/stores',  storesRouter);
```

**Checkpoint:**
```bash
# Create member
curl -s -X POST http://localhost:5000/api/members \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Priya Sharma","phone":"9876543210"}' | jq .
# → 201 with member._id, wallet created (check Atlas)

# List members
curl -s http://localhost:5000/api/members \
  -H "Authorization: Bearer $MERCHANT_TOKEN" | jq .
# → { data: [...], nextCursor: null }

# Other tenant's token cannot see this member (tenant isolation check)
```

---

## Phase 5 — Program Config: Tiers + Earn Rules (1–2 hours)

### Step 5.1 — `server/src/validators/tierValidator.js`

```javascript
import { z } from 'zod';

export const createTierSchema = z.object({
  name:             z.string().min(1),
  isDefault:        z.boolean().optional(),
  durationType:     z.enum(['DAILY','MONTHLY','QUARTERLY','HALF_YEARLY','CALENDER_YEARLY','FINANCIAL_YEARLY']),
  duration:         z.number().int().min(1),
  pointsMultiplier: z.number().min(1).default(1),
  upgradeVisits:    z.number().int().min(0).optional(),
  upgradeSpends:    z.number().min(0).optional(),
  upgradePoints:    z.number().int().min(0).optional(),
  upgradeRule:      z.enum(['AND','OR']).optional(),
  upgradePolicyTierId:   z.string().optional(),
  downgradePolicyTierId: z.string().optional(),
  retainVisits:     z.number().int().min(0).optional(),
  retainSpends:     z.number().min(0).optional(),
  retainPoints:     z.number().int().min(0).optional(),
  retainRule:       z.enum(['AND','OR']).optional(),
});
```

### Step 5.2 — `server/src/services/tierService.js`

```javascript
// createTier({ tenantId, ...tierData })
//   If isDefault: true → first unset isDefault on all other tiers for this tenant
//   Tier.create({ tenantId, ...tierData })

// listTiers({ tenantId })
//   Tier.find({ tenantId, status: 'active' }).sort({ pointsMultiplier: 1 })

// updateTier({ tenantId, tierId, updates })
//   Tier.findOneAndUpdate({ _id: tierId, tenantId }, updates, { new: true })

// checkAndUpgradeTier({ tenantId, memberId, totalAmount }, session)
//   COPIED + ADAPTED from B2C: config/cronJobs/upgradeTier.js
//   Key differences from B2C version:
//     - Add tenantId filter on every query
//     - Replace user_id with memberId
//     - Replace Purchase with Order, Transaction with LedgerEntry
//     - Wrap in the same session passed from orderService
//   Logic:
//     userTier = UserTier.findOne({ tenantId, memberId }).session(session)
//     tier = Tier.findById(userTier.tierId)
//     if !tier.upgradePolicyTierId → return (no upgrade possible)
//     [stats] = Order.aggregate([{ $match: { tenantId, memberId,
//                  createdAt: { $gte: userTier.updatedAt } } },
//               { $group: { _id: null, totalAmount: { $sum:'$totalAmount' }, count: { $sum:1 } } }])
//     [pointStats] = LedgerEntry.aggregate([...same date range, type:'CREDIT'...])
//     spendEligible   = stats?.totalAmount >= tier.upgradeSpends
//     visitEligible   = stats?.count >= tier.upgradeVisits
//     pointsEligible  = pointStats?.totalPoints >= tier.upgradePoints
//     isEligible = (tier.upgradeRule === 'AND')
//       ? spendEligible && visitEligible && pointsEligible
//       : spendEligible || visitEligible || pointsEligible
//     if !isEligible → return
//     nextTier = Tier.findById(tier.upgradePolicyTierId)
//     newExpiry = calculateExpiry(nextTier.durationType, nextTier.duration)
//     UserTier.updateOne({ memberId }, { tierId: nextTier._id, tierExpiryDate: newExpiry }, { session })
//     UserTierLog.create([{ tenantId, memberId, tierId: nextTier._id, tierAction: 'UPGRADE' }], { session })
//     RECURSE: checkAndUpgradeTier({ tenantId, memberId, totalAmount }, session)
//       (handles multi-step upgrades in a single transaction)
```

### Step 5.3 — `server/src/validators/earnRuleValidator.js`

```javascript
import { z } from 'zod';

export const createEarnRuleSchema = z.object({
  name:            z.string().min(1),
  tierId:          z.string().nullable().optional(),
  transactionUnit: z.number().int().min(1),
  pointsPerUnit:   z.number().int().min(1),
  maxPoints:       z.number().int().min(0).optional(),
  expiryDays:      z.number().int().min(1),
});
```

### Step 5.4 — `server/src/services/earnRuleService.js`

```javascript
// createEarnRule({ tenantId, ...data })
// listEarnRules({ tenantId })
// updateEarnRule({ tenantId, ruleId, updates })
// deleteEarnRule({ tenantId, ruleId })  ← soft-delete: set status: 'inactive'
```

### Step 5.5 — Routes + mount

```
controllers/tierController.js       → thin handlers
controllers/earnRuleController.js   → thin handlers
routes/tiers.js                     → MERCHANT_OWNER write, MANAGER read
routes/earnRules.js                 → MERCHANT_OWNER write, MANAGER read
```

Mount in `routes/index.js`:
```javascript
router.use('/tiers',      tiersRouter);
router.use('/earn-rules', earnRulesRouter);
```

---

## Phase 6 — Order: Earn + Redeem (3–4 hours — the core)

This is the most important phase. Take it step by step.

### Step 6.1 — `server/src/middleware/idempotency.js`

```javascript
import IdempotencyKey from '../models/IdempotencyKey.js';
import { ApiError } from '../utils/ApiError.js';

export async function idempotency(req, _res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next(new ApiError(400, 'Idempotency-Key header is required'));
  const existing = await IdempotencyKey.findOne({ tenantId: req.user.tenantId, key });
  if (existing) {
    return res.status(existing.statusCode).json(existing.response);
  }
  req.idempotencyKey = key;
  next();
}
```

### Step 6.2 — `server/src/services/ledgerService.js`

Two functions. Both receive a Mongoose session — they do NOT start their own transaction.

```javascript
import mongoose from 'mongoose';
import LedgerEntry from '../models/LedgerEntry.js';
import Wallet from '../models/Wallet.js';
import EarnRule from '../models/EarnRule.js';
import UserTier from '../models/UserTier.js';

// ─── earnPoints ───────────────────────────────────────────────────────────────
// Called inside orderService transaction
// Arguments: { tenantId, memberId, orderId, totalAmount, actorId }, session
// Returns: { pointsEarned, ledgerEntry }
export async function earnPoints({ tenantId, memberId, orderId, totalAmount }, session) {
  // 1. Get member's current tier
  const userTier = await UserTier.findOne({ tenantId, memberId }).session(session);

  // 2. Find earn rule: tier-specific first, then null (catch-all)
  const earnRule = await EarnRule.findOne({
    tenantId,
    status: 'active',
    $or: [{ tierId: userTier?.tierId }, { tierId: null }],
  }).sort({ tierId: -1 }).session(session); // prefer tier-specific
  if (!earnRule) return { pointsEarned: 0, ledgerEntry: null };

  // 3. Calculate points
  const raw = Math.floor((totalAmount / earnRule.transactionUnit) * earnRule.pointsPerUnit);
  const multiplier = 1; // Tier multiplier: fetch from Tier if needed
  let pointsEarned = raw * multiplier;
  if (earnRule.maxPoints) pointsEarned = Math.min(pointsEarned, earnRule.maxPoints);
  if (pointsEarned <= 0) return { pointsEarned: 0, ledgerEntry: null };

  // 4. Calculate expiry
  const pointExpiryDate = new Date();
  pointExpiryDate.setDate(pointExpiryDate.getDate() + earnRule.expiryDays);

  // 5. Create CREDIT LedgerEntry
  const [entry] = await LedgerEntry.create([{
    tenantId, memberId, type: 'CREDIT',
    points: pointsEarned, remainingPoints: pointsEarned,
    pointExpiryDate, conclusion: 'ACTIVE',
    source: 'ORDER', orderId,
  }], { session });

  // 6. Update Wallet
  await Wallet.updateOne({ tenantId, memberId }, { $inc: { balance: pointsEarned } }, { session });

  return { pointsEarned, ledgerEntry: entry };
}


// ─── redeemPoints ─────────────────────────────────────────────────────────────
// Called inside orderService transaction
// Arguments: { tenantId, memberId, pointsToRedeem, orderId }, session
// Returns: { pointsBurned }
export async function redeemPoints({ tenantId, memberId, pointsToRedeem, orderId }, session) {
  // 1. Check wallet balance
  const wallet = await Wallet.findOne({ tenantId, memberId }).session(session);
  if (!wallet || wallet.balance < pointsToRedeem)
    throw new ApiError(400, 'Insufficient points balance');

  // 2. FIFO: get ACTIVE CREDIT lots, oldest expiry first
  const lots = await LedgerEntry.find({
    tenantId, memberId, type: 'CREDIT', conclusion: 'ACTIVE',
    remainingPoints: { $gt: 0 },
  }).sort({ pointExpiryDate: 1 }).session(session);

  // 3. Burn lots
  let remaining = pointsToRedeem;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const burn = Math.min(lot.remainingPoints, remaining);
    const newRemaining = lot.remainingPoints - burn;
    await LedgerEntry.updateOne(
      { _id: lot._id },
      {
        $inc: { remainingPoints: -burn },
        ...(newRemaining === 0 && { conclusion: 'REDEEMED' }),
      },
      { session }
    );
    remaining -= burn;
  }

  // 4. Create DEBIT summary LedgerEntry
  await LedgerEntry.create([{
    tenantId, memberId, type: 'DEBIT',
    points: -pointsToRedeem, remainingPoints: 0,
    conclusion: 'REDEEMED', source: 'ORDER', orderId,
  }], { session });

  // 5. Decrement wallet
  await Wallet.updateOne({ tenantId, memberId }, { $inc: { balance: -pointsToRedeem } }, { session });

  return { pointsBurned: pointsToRedeem };
}
```

### Step 6.3 — `server/src/validators/orderValidator.js`

```javascript
import { z } from 'zod';

const itemSchema = z.object({
  skuCode:  z.string().optional(),
  skuName:  z.string().optional(),
  quantity: z.number().int().min(1),
  rate:     z.number().min(0),
  amount:   z.number().min(0),
});

export const createOrderSchema = z.object({
  memberId:       z.string(),
  billId:         z.string().min(1),
  items:          z.array(itemSchema).optional(),
  totalAmount:    z.number().min(0),
  storeId:        z.string().optional(),
  walletUsed:     z.boolean().default(false),
  pointsToRedeem: z.number().int().min(0).default(0),
  offerDiscount:  z.number().min(0).optional(),
});
```

### Step 6.4 — `server/src/services/orderService.js`

```javascript
import mongoose from 'mongoose';
import Member from '../models/Member.js';
import Order from '../models/Order.js';
import IdempotencyKey from '../models/IdempotencyKey.js';
import AuditLog from '../models/AuditLog.js';
import { earnPoints, redeemPoints } from './ledgerService.js';
import { checkAndUpgradeTier } from './tierService.js';
import { ApiError } from '../utils/ApiError.js';

export async function createOrder({
  tenantId, actorId, idempotencyKey,
  memberId, billId, items, totalAmount,
  storeId, walletUsed, pointsToRedeem, offerDiscount,
}) {
  // 1. Validate member
  const member = await Member.findOne({ _id: memberId, tenantId });
  if (!member) throw new ApiError(404, 'Member not found');
  if (member.status !== 'active') throw new ApiError(400, 'Member is not active');

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // 2. Redeem first (if requested)
      let pointsBurned = 0;
      if (walletUsed && pointsToRedeem > 0) {
        ({ pointsBurned } = await redeemPoints(
          { tenantId, memberId, pointsToRedeem, orderId: null }, session
        ));
      }

      // 3. Create order
      const [order] = await Order.create([{
        tenantId, memberId, billId, items, totalAmount,
        storeId, actorId, offerDiscount,
        pointsBurned, status: 'completed',
      }], { session });

      // 4. Earn points
      const { pointsEarned } = await earnPoints(
        { tenantId, memberId, orderId: order._id, totalAmount, actorId },
        session
      );

      // 5. Update order with earned points
      await Order.updateOne({ _id: order._id }, { pointsEarned }, { session });

      // 6. Check tier upgrade (recursive, inside same txn)
      await checkAndUpgradeTier({ tenantId, memberId, totalAmount }, session);

      // 7. Save idempotency record
      const response = {
        success: true,
        data: { orderId: order._id, billId, pointsEarned, pointsBurned, totalAmount },
      };
      await IdempotencyKey.create([{
        tenantId, key: idempotencyKey,
        statusCode: 201, response,
      }], { session });

      // 8. Audit
      await AuditLog.create([{
        tenantId, actorId, action: 'ORDER_CREATED',
        entity: 'Order', entityId: order._id,
        after: { pointsEarned, pointsBurned, totalAmount },
      }], { session });

      result = response;
    });
  } finally {
    await session.endSession();
  }
  return result;
}
```

### Step 6.5 — `server/src/controllers/orderController.js`

Thin handler:
```javascript
import { asyncHandler } from '../utils/asyncHandler.js';
import * as orderService from '../services/orderService.js';
import Order from '../models/Order.js';
import { ApiError } from '../utils/ApiError.js';

export const createOrder = asyncHandler(async (req, res) => {
  const result = await orderService.createOrder({
    tenantId:       req.user.tenantId,
    actorId:        req.user.userId,
    idempotencyKey: req.idempotencyKey,
    ...req.body,
  });
  res.status(201).json(result);
});

export const listOrders = asyncHandler(async (req, res) => {
  const { cursor, limit = 20, memberId } = req.query;
  const query = { tenantId: req.user.tenantId };
  if (memberId) query.memberId = memberId;
  if (cursor) query._id = { $lt: cursor };
  const orders = await Order.find(query).sort({ _id: -1 }).limit(Number(limit) + 1);
  const nextCursor = orders.length > limit ? orders.pop()._id : null;
  res.json({ success: true, data: { orders, nextCursor } });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!order) throw new ApiError(404, 'Order not found');
  res.json({ success: true, data: { order } });
});
```

### Step 6.6 — `server/src/routes/orders.js`

```javascript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { createOrderSchema } from '../validators/orderValidator.js';
import * as ctrl from '../controllers/orderController.js';

const router = Router();
router.use(authenticate);

router.post('/',
  validate(createOrderSchema),
  requirePermission('transactions', 'write'),
  idempotency,
  ctrl.createOrder
);
router.get('/',    requirePermission('transactions', 'read'), ctrl.listOrders);
router.get('/:id', requirePermission('transactions', 'read'), ctrl.getOrder);

export default router;
```

Mount: `router.use('/orders', ordersRouter);`

**Checkpoint:**
```bash
IDKEY="order-$(date +%s)"

# Create order with earn only
curl -s -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDKEY" \
  -d '{"memberId":"<id>","billId":"BILL-001","totalAmount":500}' | jq .
# → 201 { pointsEarned: N, pointsBurned: 0 }

# Send EXACT same request again (same Idempotency-Key)
curl -s -X POST http://localhost:5000/api/orders \
  -H "Authorization: Bearer $MERCHANT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDKEY" \
  -d '{"memberId":"<id>","billId":"BILL-001","totalAmount":500}' | jq .
# → 201 with IDENTICAL response (cached — no second entry in LedgerEntry)

# Verify in Atlas: LedgerEntry has only 1 CREDIT document for this order
```

---

## Phase 7 — Staff + Roles (1 hour)

### Step 7.1 — `server/src/validators/staffValidator.js`

```javascript
import { z } from 'zod';

export const createStaffSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['MERCHANT_MANAGER', 'MERCHANT_STAFF']),
  roleId:   z.string().optional(),
});
```

### Step 7.2 — `server/src/services/staffService.js`

```javascript
// createStaff({ tenantId, actorId, name, email, password, role, roleId })
//   1. If roleId: Role.findOne({ _id: roleId, tenantId }) → 404 if missing
//   2. Check User.findOne({ email, tenantId }) → 409 if exists
//   3. empId = generateId('EMP')
//   4. hash password
//   5. User.create({ tenantId, name, email, passwordHash, role, roleId, empId })
//   6. AuditLog
//   Returns: { user }  (no passwordHash)

// listStaff({ tenantId })
//   User.find({ tenantId, role: { $in: ['MERCHANT_MANAGER','MERCHANT_STAFF'] } })
//        .populate('roleId')

// deactivateStaff({ tenantId, userId, actorId })
//   User.findOneAndUpdate({ _id: userId, tenantId }, { status: 'inactive' })
//   AuditLog
```

### Step 7.3 — `server/src/services/roleService.js`

```javascript
// createRole({ tenantId, name, level, access[] })
//   access example: [{ module: 'members', read: true, write: false }]
//   Role.create({ tenantId, name, level, access })

// listRoles({ tenantId })
//   Role.find({ tenantId, status: 'active' })

// updateRole({ tenantId, roleId, updates })
```

### Step 7.4 — Routes

```
routes/staff.js   → POST /staff, GET /staff, DELETE /staff/:id (MERCHANT_OWNER only)
routes/roles.js   → POST /roles, GET /roles, PUT /roles/:id   (MERCHANT_OWNER only)
```

Mount both in `routes/index.js`.

---

## Phase 8 — Analytics (1 hour)

### Step 8.1 — `server/src/services/analyticsService.js`

```javascript
import Member from '../models/Member.js';
import Wallet from '../models/Wallet.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Order from '../models/Order.js';
import UserTier from '../models/UserTier.js';
import Tier from '../models/Tier.js';

export async function getDashboard({ tenantId }) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalMembers,
    activeMembers,
    [liabilityAgg],
    [earnedAgg],
    [redeemedAgg],
    totalOrders30d,
    tierDist,
  ] = await Promise.all([
    Member.countDocuments({ tenantId }),
    Member.countDocuments({ tenantId, status: 'active' }),
    Wallet.aggregate([{ $match: { tenantId } }, { $group: { _id: null, total: { $sum: '$balance' } } }]),
    LedgerEntry.aggregate([
      { $match: { tenantId, type: 'CREDIT', createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]),
    LedgerEntry.aggregate([
      { $match: { tenantId, type: 'DEBIT', createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]),
    Order.countDocuments({ tenantId, createdAt: { $gte: thirtyDaysAgo } }),
    UserTier.aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$tierId', count: { $sum: 1 } } },
      { $lookup: { from: 'tiers', localField: '_id', foreignField: '_id', as: 'tier' } },
    ]),
  ]);

  return {
    totalMembers,
    activeMembers,
    pointsLiability: liabilityAgg?.total || 0,
    pointsEarned30d:    Math.abs(earnedAgg?.total    || 0),
    pointsRedeemed30d:  Math.abs(redeemedAgg?.total  || 0),
    totalOrders30d,
    tierDistribution: tierDist,
  };
}

export async function getMemberLedger({ tenantId, memberId, cursor, limit = 20 }) {
  const query = { tenantId, memberId };
  if (cursor) query._id = { $lt: cursor };
  const entries = await LedgerEntry.find(query).sort({ _id: -1 }).limit(Number(limit) + 1);
  const nextCursor = entries.length > limit ? entries.pop()._id : null;
  return { data: entries, nextCursor };
}
```

### Step 8.2 — Route `routes/analytics.js`

```javascript
// GET /analytics/dashboard    → MERCHANT_OWNER, MERCHANT_MANAGER
// GET /analytics/ledger/:memberId → any authenticated tenant user
```

---

## Phase 9 — Background Jobs (1 hour)

### Step 9.1 — `server/src/jobs/pointExpiry.js`

Adapted from `B2C: config/cronJobs/expirePoints.js` — field name changes:
- `user_id` → `memberId`
- `point_conclusion` → `conclusion`
- `Transaction` → `LedgerEntry`
- Add `tenantId` to every query and every write

```javascript
import LedgerEntry from '../models/LedgerEntry.js';
import Wallet from '../models/Wallet.js';

export async function expireUserPoints() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Find all ACTIVE lots that have expired
  const expiredLots = await LedgerEntry.find({
    type: 'CREDIT', conclusion: 'ACTIVE',
    pointExpiryDate: { $lte: today },
    remainingPoints: { $gt: 0 },
  }).lean();

  let count = 0;
  for (const lot of expiredLots) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await LedgerEntry.updateOne(
          { _id: lot._id },
          { conclusion: 'EXPIRED', remainingPoints: 0 },
          { session }
        );
        await Wallet.updateOne(
          { tenantId: lot.tenantId, memberId: lot.memberId },
          { $inc: { balance: -lot.remainingPoints } },
          { session }
        );
      });
      count++;
    } finally {
      await session.endSession();
    }
  }
  console.log(`[pointExpiry] ${count} lots expired`);
}
```

### Step 9.2 — `server/src/jobs/tierDowngrade.js`

Adapted from `B2C: config/cronJobs/downgradeTier.js`:
- Add `tenantId` to every query
- Replace `user_id` → `memberId`
- Replace `Purchase` → `Order`, `Transaction` → `LedgerEntry`
- Replace `total_amount` → `totalAmount`, `order_date` → `createdAt`

```javascript
import mongoose from 'mongoose';
import UserTier from '../models/UserTier.js';
import Tier from '../models/Tier.js';
import Order from '../models/Order.js';
import LedgerEntry from '../models/LedgerEntry.js';
import UserTierLog from '../models/UserTierLog.js';
import { calculateExpiry } from '../utils/calculateExpiry.js';

export async function downgradeTiers() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const expiredUserTiers = await UserTier.find({
    tierExpiryDate: { $lte: today },
  }).lean();

  let count = 0;
  for (const userTier of expiredUserTiers) {
    const tier = await Tier.findById(userTier.tierId);
    if (!tier?.downgradePolicyTierId) continue;

    // Aggregate orders + points in the tier period
    const [orderStats] = await Order.aggregate([
      { $match: { tenantId: userTier.tenantId, memberId: new mongoose.Types.ObjectId(`${userTier.memberId}`),
                  createdAt: { $gte: userTier.updatedAt, $lte: userTier.tierExpiryDate } } },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]);
    const [pointStats] = await LedgerEntry.aggregate([
      { $match: { tenantId: userTier.tenantId, memberId: new mongoose.Types.ObjectId(`${userTier.memberId}`),
                  type: 'CREDIT',
                  createdAt: { $gte: userTier.updatedAt, $lte: userTier.tierExpiryDate } } },
      { $group: { _id: null, totalPoints: { $sum: '$points' } } },
    ]);

    const spendEligible  = (orderStats?.totalAmount || 0) < tier.retainSpends;
    const visitEligible  = (orderStats?.count || 0) < tier.retainVisits;
    const pointEligible  = (pointStats?.totalPoints || 0) < tier.retainPoints;

    const shouldDowngrade = tier.retainRule === 'AND'
      ? spendEligible && visitEligible && pointEligible
      : spendEligible || visitEligible || pointEligible;

    if (!shouldDowngrade) continue;

    const downTier = await Tier.findById(tier.downgradePolicyTierId);
    const payload = { tierId: tier.downgradePolicyTierId };
    if (downTier?.durationType && downTier?.duration && !downTier.isDefault) {
      payload.tierExpiryDate = calculateExpiry(downTier.durationType, downTier.duration);
    }

    await UserTier.updateOne({ _id: userTier._id }, payload);
    await UserTierLog.create({
      tenantId: userTier.tenantId, memberId: userTier.memberId,
      tierId: tier.downgradePolicyTierId, tierAction: 'DOWNGRADE',
    });
    count++;
  }
  console.log(`[tierDowngrade] ${count} users downgraded`);
}
```

### Step 9.3 — `server/src/jobs/scheduler.js`

```javascript
import cron from 'node-cron';
import { expireUserPoints } from './pointExpiry.js';
import { downgradeTiers }   from './tierDowngrade.js';

export function startJobs() {
  cron.schedule('5 0 * * *', () => {
    console.log('[cron] pointExpiry starting');
    expireUserPoints().catch(console.error);
  });
  cron.schedule('10 0 * * *', () => {
    console.log('[cron] tierDowngrade starting');
    downgradeTiers().catch(console.error);
  });
}
```

### Step 9.4 — Start jobs in `server.js`

```javascript
import { startJobs } from './jobs/scheduler.js';
// After connectDB():
startJobs();
```

---

## Phase 10 — Platform Admin (30 min)

### Step 10.1 — `server/src/services/platformService.js`

```javascript
// listTenants({ cursor, limit })
//   No tenantId filter — platform admin sees all
//   Tenant.find({ ...(cursor && { _id: { $gt: cursor } }) }).sort({ _id: 1 }).limit(limit + 1)

// getTenantStats({ tenantId })
//   Parallel: Member.countDocuments, Order.countDocuments, Wallet.aggregate(liability)

// updateTenantStatus({ tenantId, status, actorId })
//   Tenant.findByIdAndUpdate(tenantId, { status })
//   AuditLog (no tenantId on AuditLog for platform actions)
```

### Step 10.2 — `server/src/routes/platform.js`

```javascript
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import * as platformController from '../controllers/platformController.js';

const router = Router();
router.use(authenticate, requireRole('PLATFORM_ADMIN'));

router.get('/tenants',            platformController.listTenants);
router.get('/tenants/:id',        platformController.getTenant);
router.patch('/tenants/:id/status', platformController.updateTenantStatus);

export default router;
```

Mount: `router.use('/platform', platformRouter);`

---

## Phase 11 — Frontend (React + Vite + Tailwind)

### Step 11.1 — Init

```bash
cd /Users/vaibhavpandey/Desktop/Loyalty-System-POS
npm create vite@latest client -- --template react
cd client
npm install
npm install axios react-router-dom @tanstack/react-query
npm install tailwindcss @tailwindcss/vite
```

Configure Tailwind in `vite.config.js`:
```javascript
import tailwindcss from '@tailwindcss/vite';
export default { plugins: [react(), tailwindcss()] };
```

Add to `src/index.css`:
```css
@import "tailwindcss";
```

### Step 11.2 — `client/src/api/axios.js` (critical — auto refresh)

```javascript
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let queue = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) return Promise.reject(err);
    original._retry = true;
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }
    isRefreshing = true;
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      const { data } = await axios.post('/api/auth/refresh', { refreshToken });
      const { accessToken, refreshToken: newRefresh } = data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', newRefresh);
      queue.forEach((p) => p.resolve(accessToken));
      queue = [];
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch (refreshErr) {
      queue.forEach((p) => p.reject(refreshErr));
      queue = [];
      localStorage.clear();
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
```

### Step 11.3 — Build order for pages

Build in this exact order (each page calls the API + shows data before moving on):

```
1.  api/axios.js             ← done above
2.  context/AuthContext.jsx  ← stores user+tokens, login/logout, reads role
3.  /login                   ← POST /api/auth/login → store tokens → redirect
4.  /register                ← POST /api/auth/signup → store tokens → redirect
5.  components/ProtectedRoute.jsx   ← redirect to /login if no token
6.  components/RoleRoute.jsx        ← redirect if role not allowed
7.  /app layout              ← sidebar + topbar with role-aware nav links
8.  /app/dashboard           ← GET /api/analytics/dashboard → metric cards
9.  /app/members             ← GET /api/members → table with search
10. /app/members/new         ← POST /api/members → form modal
11. /app/members/:id         ← GET /api/members/:id + ledger history
12. /app/pos                 ← member search → create order (earn/redeem toggle)
13. /app/tiers               ← GET/POST/PUT /api/tiers
14. /app/program             ← GET/POST/PUT /api/earn-rules
15. /app/team                ← GET/POST /api/staff
16. /app/roles               ← GET/POST /api/roles
17. /platform                ← platform admin: tenant list + suspend
```

---

## Milestones Summary

| Phase | What works |
|---|---|
| 0 | `npm run dev` starts, `/health` returns ok |
| 1 | Server connects to Atlas, no startup errors |
| 2 | All 14 models importable without errors |
| 3 | Login, signup, /me, refresh all work |
| 4 | Create + list members and stores |
| 5 | Create tiers + earn rules per tenant |
| 6 | POS order: points earned, idempotency prevents double-award |
| 7 | Staff creation + role-based permission check |
| 8 | Dashboard endpoint returns live aggregated data |
| 9 | Cron jobs registered (visible in startup log) |
| 10 | Platform admin can list and suspend tenants |
| 11 | Full frontend working end-to-end |

---

## Complete File List

```
server/
  src/
    config/         constants.js  env.js  db.js
    utils/          ApiError.js  asyncHandler.js  token.js  generateId.js  calculateExpiry.js
    models/         Tenant  User  Member  Wallet  LedgerEntry  Tier  UserTier  UserTierLog
                    EarnRule  Order  Store  Role  IdempotencyKey  AuditLog
    middleware/     auth.js  rbac.js  validate.js  error.js  idempotency.js
    services/       authService  memberService  tierService  earnRuleService
                    ledgerService  orderService  staffService  roleService
                    analyticsService  platformService
    controllers/    authController  memberController  tierController  earnRuleController
                    orderController  staffController  analyticsController  platformController
    validators/     authValidator  memberValidator  tierValidator  earnRuleValidator
                    orderValidator  staffValidator
    routes/         index.js  auth.js  members.js  stores.js  tiers.js  earnRules.js
                    orders.js  staff.js  roles.js  analytics.js  platform.js
    jobs/           pointExpiry.js  tierDowngrade.js  scheduler.js
    app.js
    server.js
  scripts/
    seedAdmin.js

client/
  src/
    api/            axios.js
    context/        AuthContext.jsx
    components/     ProtectedRoute.jsx  RoleRoute.jsx  Sidebar.jsx  Topbar.jsx
    pages/          Login  Register  Dashboard  Members  MemberDetail
                    POS  Tiers  Program  Team  Roles  Platform
    App.jsx
    main.jsx
```
