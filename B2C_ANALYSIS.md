# B2C-Program-Vendor-Backend — Deep Analysis & Build Guide for LoyaltyLedger
### What this project is, what you can take from it, and exactly how to build yours

---

## How to use this document

This document has four parts:
1. **What the B2C project is** — full architectural understanding
2. **The critical differences** between B2C and your LoyaltyLedger
3. **What you can copy** — exact files, exact logic, what to adapt
4. **What you must build fresh** — where B2C cuts corners you cannot afford to

Read Part 1 and 2 before touching any code. Parts 3 and 4 are your day-to-day reference while building.

---

# PART 1 — WHAT THE B2C PROJECT IS

---

## 1.1 The Big Picture

The B2C project is a **single-vendor, multi-sub-brand loyalty platform** deployed as one Node.js server. One running instance serves exactly one merchant (called a "vendor" or "brand"). The system has three distinct user surfaces baked into the same codebase:

| Folder | Who uses it | Route prefix | What they do |
|---|---|---|---|
| `app/` | Vendor's own employees (admins) | `/api/*` | Manage loyalty config, customers, purchases, roles |
| `app_superadmin/` | The super admin of this vendor | `/api/brand` | Manage the brand entity itself |
| `app_user/` | End customers (loyalty members) | `/api/users/*` | Login, view wallet, see transactions, redeem |

**The real "Super Admin"** (the entity that owns the point treasury and can mint points for vendors) lives in a completely separate external service accessed via HTTP. This vendor backend only consumes it — it doesn't contain it. That external service is what maps to your `PLATFORM_ADMIN` role.

**Your LoyaltyLedger is different:** You are building the multi-tenant version of this entire setup. Instead of deploying a separate instance per merchant, you'll have one system where each merchant is a `Tenant` isolated by `tenantId`. Your `PLATFORM_ADMIN` is the treasury owner — it's you.

---

## 1.2 The Three-Layer Point Economy

This is the most important concept to understand from B2C. Points flow through three layers:

```
LAYER 1: External Treasury (ADMIN_URL external service)
         ↓  allocates a pool of points to the vendor
LAYER 2: Vendor Pool (Admin.brand.allocatedPoints)
         ↓  vendor distributes points to sub-brands
         SubBrand.points (per product-line sub-pool)
LAYER 3: Customer Wallets
         Wallet.balance       ← global points from amount-based offers
         SubBrandWallet.balance ← SKU/product-specific points
```

**In your LoyaltyLedger, this simplifies to two layers:**

```
LAYER 1: Platform (you) — you control the treasury, no external service needed
LAYER 2: Tenant.pointPool → Member.wallet.balance
```

The SubBrand/SubBrandWallet complexity is a B2C-specific feature (per-product-line wallets). For your MVP, you don't need this. You can add it later as a "sub-brand" or "category wallet" feature.

---

## 1.3 The Dual Ledger (The Core of Points)

The B2C system has two parallel ledgers:

**Ledger A — Global (amount-based offers):**
- `Wallet` — stores the running balance (`balance` field, updated with `$inc`)
- `Transaction` — the FIFO lot ledger. Each earn creates one lot with `remainingPoints` and `point_expiry_date`. Redemption burns lots oldest-expiry-first.

**Ledger B — Per-SubBrand (SKU-based offers):**
- `SubBrandWallet` — balance per `(userId, subBrandId)` pair
- `SubBrandTransaction` — debit/credit log per sub-brand

**For your LoyaltyLedger MVP: only Ledger A.** One wallet, one ledger. SubBrand is a Phase 2 feature.

---

## 1.4 The Transaction (PointLot) Schema — The Heart of It

```
Transaction {
  user_id           → which customer
  transaction_id    → unique string (for idempotency reference)
  type              → CREDIT (earn) | DEBIT (burn summary)
  points            → original points in this lot
  remainingPoints   → how many are still burnable (decreases on redemption)
  point_expiry_date → when this lot expires
  point_conclusion  → ACTIVE | REDEEMED | EXPIRED | ROLLBACK
  transaction_source→ where points came from: PURCHASE | ENROLLMENT | TIER | REFERRER | CAMPAIGN | ROLLBACK
  order_id          → links back to the purchase that triggered this
  points_multiplier → tier multiplier applied at earn time
  subBrands[]       → per-subbrand breakdown (only in B2C, skip for MVP)
}
```

**The FIFO burn logic:** When a customer redeems, the system loads all their CREDIT lots sorted by `point_expiry_date ASC` (soonest-to-expire first), then burns them in order. This ensures the points that would expire soonest are always consumed first — preventing waste for the customer.

---

## 1.5 The Earn Flow (manageOffer.js)

When a purchase is created (`POST /api/purchase/create`), this chain fires:

```
createPurchase()
  └── checkAndApplyOffer(order, pointMultiplier)
        1. Load user + their current tier + their tender type
        2. Query Offer where:
              status = ACTIVE
              date window covers today
              tier matches user's current tier
              offer_type = ACCRUAL (or REDEMPTION if wallet_used)
              tenders includes the payment method used
              eoss = false (not "end of season sale" exclusion)
        3. For each matching offer:
              a. Filter by store/zone
              b. Check apply_days (offer only valid on certain weekdays)
              c. Check offer_applicable (ONCE_PER_DAY | ONCE_PER_OFFER | UNLIMITED)
              d. OFFER type (amount-based):
                    points = round((total_amount / transaction_unit) * point_per_transaction)
                    points = points * combineMultipliers(tier.multiplier, customMultiplier)
                    points = min(points, max_point_allow)
                    → Wallet.$inc(balance, +points)
                    → Transaction.create(CREDIT lot)
              e. SKU_OFFER type (per-product):
                    for each SKU in the order:
                        points = quantity * points_per_qty
                    → SubBrandWallet.$inc(balance, +points)  per sub-brand
                    → Transaction.create(CREDIT lot with subBrands[])
  └── checkAndUpgradeTier(order, pointMultiplier)
  └── manageReferral(order)
  └── issueCoupon(order)
```

**For your LoyaltyLedger MVP:** Only implement the OFFER type (amount-based). SKU_OFFER, coupons, referrals, and campaigns are Phase 2.

---

## 1.6 The Redemption Flow (redeemPoints.js)

```
redeemPoints(userId, order)
  1. Load all ACTIVE CREDIT lots for this user, sorted by point_expiry_date ASC
  2. For offer_discount (global wallet):
        a. Verify Wallet.balance >= offer_discount
        b. Loop through lots (FIFO):
              use = min(lot.remainingPoints, remaining_to_burn)
              Transaction.updateOne → $inc remainingPoints by -use
              if lot.remainingPoints === 0 → set point_conclusion = REDEEMED
              remaining_to_burn -= use
        c. Wallet.updateOne → $inc balance by -totalBurned
  3. Create a summary DEBIT Transaction lot
  4. Return { status: true }
```

**The big flaw here (that you MUST fix):** All of steps 2b and 2c are separate `await` calls with no wrapping MongoDB transaction/session. If the server crashes between step 2b (lots updated) and 2c (wallet updated), the data is inconsistent. **In your rebuild, wrap the entire earn and redeem flow in a `session.withTransaction()`.**

---

## 1.7 The Tier System

Tier logic is in `helpers/manageTier.js`. Key concepts:

**Tier schema:**
```
Tier {
  name, default_tier, status
  duration_type, duration       → how long this tier lasts (MONTHLY, YEARLY, etc.)
  points_multiplier             → all points earned in this tier are multiplied by this
  upgrade_policy_tier           → which tier is the next level up
  upgrade_spends                → minimum spend to qualify for upgrade
  upgrade_visit                 → minimum visits to qualify for upgrade
  upgrade_points                → bonus points awarded when upgraded
  upgrade_rules_associate       → AND | OR (both conditions or either one)
  downgrade_policy_tier         → which tier to fall back to
  retain_spends / retain_visit / retain_points → thresholds to STAY in tier
  retain_rules_associate        → AND | OR
}
```

**Upgrade logic (fires after every purchase):**
1. Load user's current tier
2. Check if the current tier has an `upgrade_policy_tier`
3. Run an aggregation: total spend and total visits since the user entered this tier
4. Compare against `upgrade_spends` and `upgrade_visit` with AND/OR rule
5. If eligible: update `UserTier.tierId`, create a `UserTierLog`, optionally credit `upgrade_points`
6. If `multiStepTier` is enabled in settings: recurse — check if they qualify for the tier above that too (multi-level jump in one purchase)

**Downgrade logic (runs nightly via cron):**
1. Find all `UserTier` docs where `tierExpiryDate` has passed
2. Check if the user met `retain_*` thresholds during their tier period
3. If not → move them to `downgrade_policy_tier`, log it

---

## 1.8 The RBAC System

B2C uses an **access-list embedded in a Role** approach:

```
Access (master catalog, seeded):
  { serial, name, unique_id: "A001", permission: { read, write } }

Role:
  { name, level: 1|2, access: [{ name, unique_id, permission: { read, write } }] }

Admin (employee):
  { roleId → Role }
```

Authorization: `checkPermission("A029", "write")` middleware:
1. If `req.user.userType === SUPERADMIN` → skip, allow everything
2. Load `Admin` → get their `roleId` → load `Role`
3. Check if `role.access.some(a => a.unique_id === "A029" && a.permission.write === true)`
4. If not found → 403

**This is a solid pattern.** You will adapt it for multi-tenancy in your rebuild.

---

## 1.9 Background Jobs (Cron)

| Job | Schedule | What it does |
|---|---|---|
| `expireUserPoints` | Daily | Find all CREDIT lots past `point_expiry_date` → mark EXPIRED → subtract from Wallet balance |
| `downgradeTier` | Daily | Find UserTiers past `tierExpiryDate` → check retain thresholds → downgrade if not met |
| `manageDormantLapsers` | Periodic | Classify customers as DORMANT or LAPSERS based on inactivity |
| `scheduleCouponOfferExpiry` | Daily | Expire coupon offers past end_date |
| `scheduleOfferExpiry` | Daily | Expire offers past end_date |

---

## 1.10 The Auth System (What B2C Does — and Why You Won't Copy It)

B2C uses **OAuth2 with opaque DB-stored tokens** (`@node-oauth/oauth2-server`):
- Client has `clientId` + `clientSecret`
- Admin logs in via password grant or OTP grant
- Server creates a `Token` document in MongoDB with the random opaque token string
- Every request: server looks up the token in DB to get `req.user`

**Password hashing:** `crypto.pbkdf2Sync(password, "7wyYEy9Kgq", 10, 20, "sha512")` — hardcoded salt `"7wyYEy9Kgq"` shared by ALL users. This is a critical security flaw. A single rainbow table built for this salt cracks all passwords.

**Why you won't copy this:** Your TRD mandates JWT (stateless, no DB lookup per request, horizontally scalable). Your AUTH_GUIDE.md already has the correct implementation.

---

# PART 2 — CRITICAL DIFFERENCES: B2C vs YOUR LOYALTYLEDGER

---

| Dimension | B2C (reference project) | Your LoyaltyLedger |
|---|---|---|
| **Tenancy** | Single-tenant per deployment (one vendor per instance) | Multi-tenant (shared DB, `tenantId` on every document) |
| **Auth** | OAuth2 + opaque DB tokens | JWT access + refresh tokens |
| **Password hashing** | pbkdf2Sync with hardcoded shared salt (INSECURE) | bcryptjs with per-password random salt (SECURE) |
| **DB transactions** | None — sequential `$inc` writes (CORRECTNESS RISK) | MongoDB session.withTransaction() on all money paths |
| **Idempotency** | None on earn/redeem (DUPLICATE RISK) | Idempotency-Key header + dedicated collection |
| **Point ledger** | Dual (global + per-subbrand) | Single global (SubBrand = Phase 2) |
| **RBAC** | Access-list in Role, DB lookup per request | Same pattern + tenantId scoping on Roles |
| **Earn rules** | `Offer` collection (rich: days, tiers, tenders, zones, SKUs) | `EarnRule` collection (simplified: per-amount → points, cap, expiry) |
| **Folder structure** | Feature-per-folder, no service layer (controllers call DB directly via models) | TRD architecture: route → controller → service → model |
| **Language** | CommonJS (`require`) | ES Modules (`import/export`) |
| **Treasury** | External service (ADMIN_URL) | Internal — you own it as PLATFORM_ADMIN |

---

# PART 3 — WHAT YOU CAN COPY (Logic and Patterns)

This section tells you file by file what to take, what to adapt, and what to skip.

---

## 3.1 COPY DIRECTLY — The Constants Pattern

**From:** `config/constants.js`

The pattern of `Object.freeze({})` for all enum-like values is excellent and you should use it throughout. Copy the following constant groups and adapt their names to your system:

```javascript
// Copy these constant groups — adapt values as needed:

// Transaction types — identical to what you need
export const transactionType = Object.freeze({ CREDIT: 'CREDIT', DEBIT: 'DEBIT' });

// Point lot conclusion states — copy exactly
export const transactionPointConclusion = Object.freeze({
  ACTIVE:   'ACTIVE',
  REDEEMED: 'REDEEMED',
  EXPIRED:  'EXPIRED',
  ROLLBACK: 'ROLLBACK',
});

// Transaction sources — adapt to your earn triggers
export const transactionSource = Object.freeze({
  PURCHASE:   'PURCHASE',
  ENROLLMENT: 'ENROLLMENT',
  TIER:       'TIER',
  REFERRER:   'REFERRER',   // Phase 2
  CAMPAIGN:   'CAMPAIGN',   // Phase 2
  ROLLBACK:   'ROLLBACK',
  ADJUSTMENT: 'ADJUSTMENT', // Manual admin adjustment (your addition)
});

// Duration types — you'll need these for tier durations and point expiry
export const tierDurationType = Object.freeze({
  DAILY:            'DAILY',
  MONTHLY:          'MONTHLY',
  CALENDER_YEARLY:  'CALENDER_YEARLY',
  FINANCIAL_YEARLY: 'FINANCIAL_YEARLY',
  HALF_YEARLY:      'HALF_YEARLY',
  QUARTERLY:        'QUARTERLY',
});

// Tier actions — for UserTierLog
export const tierAction = Object.freeze({ UPGRADE: 'UPGRADE', DOWNGRADE: 'DOWNGRADE' });

// Tier associate rule — AND/OR logic
export const tierAssociateRule = Object.freeze({ AND: 'AND', OR: 'OR' });

// Status values
export const statusAI  = Object.freeze({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' });
export const statusAIP = Object.freeze({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', PENDING: 'PENDING' });
```

**What to add that B2C doesn't have:**
```javascript
// These are specific to your multi-tenant build
export const USER_ROLES = Object.freeze({
  PLATFORM_ADMIN:   'PLATFORM_ADMIN',
  MERCHANT_OWNER:   'MERCHANT_OWNER',
  MERCHANT_MANAGER: 'MERCHANT_MANAGER',
  MERCHANT_STAFF:   'MERCHANT_STAFF',
  MEMBER:           'MEMBER',
});
```

---

## 3.2 COPY AND ADAPT — The LedgerEntry (Transaction) Schema

**From:** `schema/Transaction.js`

This is the most important schema to get right. Copy the structure but adapt it to be multi-tenant aware.

**B2C version (what it has):**
```javascript
{ user_id, transaction_id, subBrands[], type, points, remainingPoints,
  point_expiry_date, point_conclusion, transaction_source, order_id,
  points_multiplier, is_rollback }
```

**Your version — add `tenantId`, remove `subBrands[]` (Phase 2), rename for clarity:**
```javascript
// server/src/models/LedgerEntry.js
import mongoose from 'mongoose';
import { transactionType, transactionPointConclusion, transactionSource } from '../config/constants.js';

const ledgerEntrySchema = new mongoose.Schema(
  {
    tenantId: {                            // ← YOUR ADDITION — multi-tenancy
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    memberId: {                            // renamed from user_id for clarity
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    idempotencyKey: {                      // ← YOUR ADDITION — prevent duplicate earn/burn
      type: String,
      unique: true,
      sparse: true,
    },
    type: {
      type: String,
      enum: Object.values(transactionType),
      required: true,
    },
    points: {
      type: Number,
      required: true,
      min: 0,
    },
    remainingPoints: {                     // decrements on each FIFO burn
      type: Number,
      min: 0,
    },
    pointExpiryDate: {                     // renamed from point_expiry_date (camelCase)
      type: Date,
    },
    conclusion: {                          // renamed from point_conclusion
      type: String,
      enum: Object.values(transactionPointConclusion),
      default: transactionPointConclusion.ACTIVE,
    },
    source: {                              // renamed from transaction_source
      type: String,
      enum: Object.values(transactionSource),
    },
    orderId: {                             // renamed from order_id
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    pointsMultiplier: {                    // renamed from points_multiplier
      type: Number,
      min: 1,
      default: 1,
    },
    isRollback: {                          // renamed from is_rollback
      type: Boolean,
      default: false,
    },
    actorId: {                             // ← YOUR ADDITION — who triggered this
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    note: String,                          // ← YOUR ADDITION — for manual adjustments
  },
  { timestamps: true }
);

// Compound index — always lead with tenantId
ledgerEntrySchema.index({ tenantId: 1, memberId: 1, conclusion: 1, pointExpiryDate: 1 });
ledgerEntrySchema.index({ tenantId: 1, orderId: 1 });

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
```

---

## 3.3 COPY AND ADAPT — The Wallet Schema

**From:** `schema/Wallet.js`

B2C version is clean. Your adaptation:

```javascript
// server/src/models/Wallet.js
import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    tenantId: {                            // ← YOUR ADDITION
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// Unique compound index — one wallet per member per tenant
walletSchema.index({ tenantId: 1, memberId: 1 }, { unique: true });

export const Wallet = mongoose.model('Wallet', walletSchema);
```

**B2C bug you're fixing:** B2C has `walletSchema.index({ user_id: 1 })` — NOT unique. A user can have multiple wallet documents which is a data integrity bug. You enforce uniqueness with `{ unique: true }` on the compound index.

---

## 3.4 COPY AND ADAPT — The Tier Schema

**From:** `schema/Tier.js`

B2C's Tier schema is well-designed. Copy it almost entirely, just add `tenantId` and convert to camelCase.

```javascript
// server/src/models/Tier.js
import mongoose from 'mongoose';
import { statusAIP, tierDurationType, tierAssociateRule } from '../config/constants.js';

const tierSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false, required: true }, // renamed from default_tier
    status: { type: String, enum: Object.values(statusAIP), default: statusAIP.PENDING },
    durationType: { type: String, enum: Object.values(tierDurationType), required: true },
    duration: { type: Number, required: true, min: 1 },
    narration: { type: String, trim: true },
    pointsMultiplier: { type: Number, min: 1, default: 1 },

    // Upgrade policy
    upgradePolicyTierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' },
    upgradeSpends: { type: Number, min: 0 },
    upgradeVisits: { type: Number, min: 0 },
    upgradePoints: { type: Number, min: 0 },     // bonus points on upgrade
    upgradeRule: { type: String, enum: Object.values(tierAssociateRule), default: tierAssociateRule.OR },

    // Downgrade / retain policy
    downgradePolicyTierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' },
    retainSpends: { type: Number, min: 0 },
    retainVisits: { type: Number, min: 0 },
    retainPoints: { type: Number, min: 0 },
    retainRule: { type: String, enum: Object.values(tierAssociateRule), default: tierAssociateRule.OR },
  },
  { timestamps: true }
);

tierSchema.index({ tenantId: 1 });

export const Tier = mongoose.model('Tier', tierSchema);
```

**Also create UserTier and UserTierLog:**

```javascript
// server/src/models/UserTier.js
const userTierSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, required: true },
  memberId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  tierId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tier', required: true },
  tierExpiryDate: { type: Date },
}, { timestamps: true });

userTierSchema.index({ tenantId: 1, memberId: 1 }, { unique: true });

// server/src/models/UserTierLog.js
const userTierLogSchema = new mongoose.Schema({
  tenantId:        { type: mongoose.Schema.Types.ObjectId, required: true },
  memberId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  oldTierId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' },
  newTierId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tier', required: true },
  action:          { type: String, enum: ['UPGRADE', 'DOWNGRADE'], required: true },
  points:          { type: Number, default: 0 },
  triggeredByOrder:{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: true });
```

---

## 3.5 COPY AND ADAPT — The Purchase (Order) Schema

**From:** `schema/Purchase.js`

Excellent schema. Copy the structure, add `tenantId`, rename fields to camelCase.

```javascript
// server/src/models/Order.js
import mongoose from 'mongoose';
import { purchaseItemStatus, purchaseStatus } from '../config/constants.js';

const itemSchema = new mongoose.Schema({
  skuId:     { type: String },           // SKU code or ID (Phase 2: ref to SKU collection)
  skuName:   { type: String },
  quantity:  { type: Number, min: 1, required: true },
  rate:      { type: Number, min: 0, required: true },
  amount:    { type: Number, min: 0, required: true },
  status:    { type: String, enum: Object.values(purchaseItemStatus), default: purchaseItemStatus.COMPLETED },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  memberId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  storeId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  billId:         { type: String, required: true },    // POS bill reference
  items:          [itemSchema],
  totalAmount:    { type: Number, required: true, min: 0 },
  offerDiscount:  { type: Number, default: 0, min: 0 }, // points used as discount
  finalAmount:    { type: Number, min: 0 },
  walletUsed:     { type: Boolean, default: false },    // true = this order burned points
  pointsEarned:   { type: Number, default: 0 },         // ← YOUR ADDITION — denormalized for display
  pointsBurned:   { type: Number, default: 0 },         // ← YOUR ADDITION
  idempotencyKey: { type: String, unique: true, sparse: true }, // ← YOUR ADDITION
  orderDate:      { type: Date, default: Date.now },
  status:         { type: String, enum: Object.values(purchaseStatus), default: purchaseStatus.COMPLETED },
}, { timestamps: true });

orderSchema.index({ tenantId: 1, memberId: 1, orderDate: -1 });
orderSchema.index({ tenantId: 1, billId: 1 });

export const Order = mongoose.model('Order', orderSchema);
```

---

## 3.6 COPY AND ADAPT — The RBAC Pattern

**From:** `schema/Role.js`, `schema/Access.js`, `middleware/checkPermission.js`

The access-list embedded in a Role is a proven, simple approach. Copy it with two adaptations: add `tenantId` to scope roles per merchant, and replace the opaque-token user identity with JWT-based `req.user`.

**Role schema:**
```javascript
// server/src/models/Role.js
const permissionSchema = new mongoose.Schema({
  module:    { type: String, required: true },  // e.g. 'members', 'transactions', 'analytics'
  read:      { type: Boolean, default: false },
  write:     { type: Boolean, default: false },
}, { _id: false });

const roleSchema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name:      { type: String, required: true, trim: true },
  level:     { type: Number, enum: [1, 2], default: 1 },    // 1=staff, 2=manager
  access:    [permissionSchema],
}, { timestamps: true });

roleSchema.index({ tenantId: 1 });
```

**Your module codes (adapt from B2C's A001-A029):**
```javascript
export const MODULE_CODES = Object.freeze({
  MEMBERS:      'members',
  TRANSACTIONS: 'transactions',
  ANALYTICS:    'analytics',
  PROGRAMS:     'programs',      // loyalty programs, tiers, earn rules
  STAFF:        'staff',         // manage employees
  ROLES:        'roles',
  STORES:       'stores',
  BILLING:      'billing',
  ADJUSTMENTS:  'adjustments',   // manual point adjustments
});
```

**Permission middleware:**
```javascript
// server/src/middleware/permission.js
// Adapted from B2C's middleware/checkPermission.js
export function requirePermission(module, action) {
  return async (req, _res, next) => {
    // PLATFORM_ADMIN bypasses all permission checks
    if (req.user.role === 'PLATFORM_ADMIN') return next();
    // MERCHANT_OWNER also bypasses within their own tenant
    if (req.user.role === 'MERCHANT_OWNER') return next();

    // For Manager and Staff: check their role's access list
    const user = await User.findById(req.user.userId).populate('roleId');
    if (!user?.roleId) return next(new ApiError(403, 'No role assigned'));

    const permission = user.roleId.access.find(a => a.module === module);
    if (!permission || !permission[action]) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    next();
  };
}

// Usage in routes:
router.get('/members', authenticate, requirePermission('members', 'read'), listMembers);
router.post('/members', authenticate, requirePermission('members', 'write'), createMember);
```

**Seeder for default access modules** (adapted from B2C's `config/seeder/access.json`):
```json
[
  { "module": "members",      "read": true, "write": true },
  { "module": "transactions", "read": true, "write": true },
  { "module": "analytics",    "read": true, "write": false },
  { "module": "programs",     "read": true, "write": true },
  { "module": "staff",        "read": true, "write": true },
  { "module": "roles",        "read": true, "write": true },
  { "module": "stores",       "read": true, "write": true },
  { "module": "billing",      "read": true, "write": false },
  { "module": "adjustments",  "read": true, "write": true }
]
```

---

## 3.7 COPY AND ADAPT — The FIFO Redeem Logic

**From:** `helpers/redeemPoints.js`

This is the most important business logic to port. The algorithm is correct — the flaw is only that it has no MongoDB transaction wrapping. Here's the adapted, transaction-safe version:

```javascript
// server/src/services/ledgerService.js

export async function redeemPoints({ tenantId, memberId, pointsToRedeem, orderId, actorId }, session) {
  // 1. Check wallet has enough balance
  const wallet = await Wallet.findOne({ tenantId, memberId }).session(session);
  if (!wallet || wallet.balance < pointsToRedeem) {
    throw new ApiError(400, 'Insufficient points balance');
  }

  // 2. Load ACTIVE CREDIT lots sorted FIFO (soonest expiry first)
  const lots = await LedgerEntry.find({
    tenantId,
    memberId,
    type: 'CREDIT',
    remainingPoints: { $gt: 0 },
    pointExpiryDate: { $gte: new Date() },
    conclusion: 'ACTIVE',
  }).sort({ pointExpiryDate: 1, createdAt: 1 }).session(session);

  // 3. Burn FIFO
  let remaining = pointsToRedeem;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const use = Math.min(lot.remainingPoints, remaining);
    const newRemaining = lot.remainingPoints - use;

    await LedgerEntry.updateOne(
      { _id: lot._id },
      {
        $inc: { remainingPoints: -use },
        $set: { conclusion: newRemaining === 0 ? 'REDEEMED' : 'ACTIVE' },
      },
      { session }
    );
    remaining -= use;
  }

  // 4. Decrement wallet balance
  await Wallet.updateOne(
    { tenantId, memberId },
    { $inc: { balance: -pointsToRedeem } },
    { session }
  );

  // 5. Create DEBIT summary entry
  await LedgerEntry.create([{
    tenantId,
    memberId,
    type: 'DEBIT',
    points: pointsToRedeem,
    source: 'PURCHASE',
    orderId,
    actorId,
  }], { session });
}
```

**Call it from your earn/redeem service wrapped in a Mongo session:**
```javascript
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  await redeemPoints({ tenantId, memberId, pointsToRedeem, orderId, actorId }, session);
});
session.endSession();
```

---

## 3.8 COPY AND ADAPT — The Earn Logic

**From:** `helpers/manageOffer.js` (simplified — your MVP's EarnRule is simpler than B2C's Offer)

B2C's Offer is very rich (days, tenders, zones, SKUs). For your MVP, simplify to a single EarnRule per tenant:

```javascript
// server/src/models/EarnRule.js
const earnRuleSchema = new mongoose.Schema({
  tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name:           { type: String, required: true },
  pointsPerUnit:  { type: Number, required: true, min: 1 },  // points per ₹/$ spent
  transactionUnit:{ type: Number, required: true, min: 1 },  // e.g. 1 point per ₹10
  maxPoints:      { type: Number, min: 0 },                  // cap per transaction (0 = no cap)
  expiryDays:     { type: Number, min: 1, required: true },  // how many days earned points last
  status:         { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  tierId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' }, // null = applies to all tiers
}, { timestamps: true });
```

**The earn service:**
```javascript
// server/src/services/ledgerService.js

export async function earnPoints({ tenantId, memberId, order, actorId }, session) {
  // 1. Find member's current tier
  const userTier = await UserTier.findOne({ tenantId, memberId }).session(session);

  // 2. Find active earn rule for this tier (or general rule)
  const rule = await EarnRule.findOne({
    tenantId,
    status: 'ACTIVE',
    $or: [{ tierId: userTier?.tierId }, { tierId: null }],
  }).session(session);
  if (!rule) return 0;

  // 3. Calculate points
  const tier = userTier ? await Tier.findById(userTier.tierId).session(session) : null;
  const multiplier = tier?.pointsMultiplier || 1;
  let points = Math.floor((order.totalAmount / rule.transactionUnit) * rule.pointsPerUnit * multiplier);
  if (rule.maxPoints > 0) points = Math.min(points, rule.maxPoints);
  if (points <= 0) return 0;

  // 4. Calculate expiry date
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + rule.expiryDays);

  // 5. Create CREDIT lot
  await LedgerEntry.create([{
    tenantId,
    memberId,
    type: 'CREDIT',
    points,
    remainingPoints: points,
    pointExpiryDate: expiryDate,
    conclusion: 'ACTIVE',
    source: 'PURCHASE',
    orderId: order._id,
    pointsMultiplier: multiplier,
    actorId,
  }], { session });

  // 6. Increment wallet balance
  await Wallet.findOneAndUpdate(
    { tenantId, memberId },
    { $inc: { balance: points } },
    { upsert: true, session }
  );

  return points;
}
```

---

## 3.9 COPY AND ADAPT — Tier Upgrade Logic

**From:** `helpers/manageTier.js → checkAndUpgradeTier()`

The multi-step recursive tier check is smart. Copy the algorithm structure, adapt to your schema:

```javascript
// server/src/services/tierService.js

export async function checkAndUpgradeTier({ tenantId, memberId, order }, session) {
  const userTier = await UserTier.findOne({ tenantId, memberId }).session(session);
  if (!userTier) return;

  await _multiTierCheck(userTier.tierId, memberId, tenantId, order, userTier.updatedAt, session);
}

async function _multiTierCheck(tierId, memberId, tenantId, order, tierSince, session) {
  const currentTier = await Tier.findOne({ _id: tierId, status: 'ACTIVE' }).session(session);
  if (!currentTier || !currentTier.upgradePolicyTierId) return;

  // Aggregate spend + visits since user entered this tier
  const [stats] = await Order.aggregate([
    {
      $match: {
        tenantId,
        memberId: new mongoose.Types.ObjectId(`${memberId}`),
        orderDate: { $gte: tierSince },
        status: 'COMPLETED',
      },
    },
    { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
  ]).session(session);

  if (!stats) return;

  const visitOk = (stats.count || 0) >= (currentTier.upgradeVisits || 0);
  const spendOk = (stats.totalAmount || 0) >= (currentTier.upgradeSpends || 0);
  const eligible = currentTier.upgradeRule === 'AND'
    ? visitOk && spendOk
    : visitOk || spendOk;

  if (!eligible) return;

  // Issue upgrade bonus points if any
  if (currentTier.upgradePoints > 0) {
    await earnPoints({ tenantId, memberId, order: { _id: order._id, totalAmount: 0 }, actorId: null,
      _overridePoints: currentTier.upgradePoints, _source: 'TIER' }, session);
  }

  // Update user's tier
  const expiryDate = calculateExpiryDate(currentTier.durationType, currentTier.duration);
  await UserTier.updateOne(
    { tenantId, memberId },
    { tierId: currentTier.upgradePolicyTierId, tierExpiryDate: expiryDate },
    { session }
  );

  await UserTierLog.create([{
    tenantId, memberId,
    oldTierId: tierId,
    newTierId: currentTier.upgradePolicyTierId,
    action: 'UPGRADE',
    points: currentTier.upgradePoints || 0,
    triggeredByOrder: order._id,
  }], { session });

  // Recursively check if they qualify for the next tier too (multi-step)
  await _multiTierCheck(currentTier.upgradePolicyTierId, memberId, tenantId, order, new Date(), session);
}
```

---

## 3.10 COPY EXACTLY — The Point Expiry Cron Job

**From:** `config/cronJobs/expireUserPoints.js`

This logic is clean and correct. Copy it, adapt field names, and add `tenantId` filtering:

```javascript
// server/src/jobs/pointExpiry.js
import mongoose from 'mongoose';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Wallet } from '../models/Wallet.js';

export async function expireUserPoints() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Find all active lots that have passed their expiry date
  const expiredLots = await LedgerEntry.find({
    type: 'CREDIT',
    conclusion: 'ACTIVE',
    pointExpiryDate: { $lte: today },
    remainingPoints: { $gt: 0 },
  });

  let count = 0;
  for (const lot of expiredLots) {
    // Use a session per lot for atomicity
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await LedgerEntry.updateOne(
        { _id: lot._id },
        { conclusion: 'EXPIRED' },
        { session }
      );
      await Wallet.updateOne(
        { tenantId: lot.tenantId, memberId: lot.memberId },
        { $inc: { balance: -lot.remainingPoints } },
        { session }
      );
      count++;
    });
    session.endSession();
  }

  console.log(`[pointExpiry] ${count} lots expired`);
}
```

---

## 3.11 COPY EXACTLY — The Tier Downgrade Cron Job

**From:** `config/cronJobs/downgradeTier.js`

Clean logic. Copy it adapted to your schema:

```javascript
// server/src/jobs/tierDowngrade.js
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

    // Check if user met retain thresholds during their tier period
    const [stats] = await Order.aggregate([
      {
        $match: {
          memberId: userTier.memberId,
          orderDate: { $gte: userTier.updatedAt, $lte: userTier.tierExpiryDate },
          status: 'COMPLETED',
        },
      },
      { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
    ]);

    const visitFails  = !stats || stats.count < (tier.retainVisits || 0);
    const spendFails  = !stats || stats.totalAmount < (tier.retainSpends || 0);
    const shouldDowngrade = tier.retainRule === 'AND'
      ? visitFails && spendFails
      : visitFails || spendFails;

    if (!shouldDowngrade) continue;

    await UserTier.updateOne({ _id: userTier._id }, { tierId: tier.downgradePolicyTierId });
    await UserTierLog.create({
      tenantId: userTier.tenantId,
      memberId: userTier.memberId,
      oldTierId: userTier.tierId,
      newTierId: tier.downgradePolicyTierId,
      action: 'DOWNGRADE',
    });
    count++;
  }

  console.log(`[tierDowngrade] ${count} users downgraded`);
}
```

---

## 3.12 COPY AND ADAPT — The getDurationTime Helper

**From:** `helpers/getDurationTime.js`

You need this to calculate `point_expiry_date` and `tierExpiryDate`. Read this file and copy the `calculateDurationEndDate(durationType, duration)` function — it converts `MONTHLY`, `QUARTERLY`, `HALF_YEARLY`, `CALENDER_YEARLY`, `FINANCIAL_YEARLY`, `DAILY` into a JavaScript `Date`. Just change the import paths and rename the constants to match yours.

---

## 3.13 COPY AND ADAPT — The generateUniqueId Helper

**From:** `helpers/generateUniqueId.js`

B2C uses this to generate IDs like `TXN-ABC123`, `EMP-XYZ456`. Copy the pattern for generating readable transaction IDs, customer IDs, and bill IDs:

```javascript
// server/src/utils/generateId.js
import crypto from 'node:crypto';

export function generateId(prefix) {
  const unique = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${unique}`;
}
// Usage: generateId('TXN') → "TXN-A1B2C3D4"
//        generateId('MBR') → "MBR-F5E6D7C8"
```

---

# PART 4 — WHAT YOU MUST BUILD FRESH (B2C Has No Version of This)

These are the things B2C either does wrong, does simply differently, or doesn't do at all. You cannot copy these — you must build them correctly from scratch using your TRD and AUTH_GUIDE.

---

## 4.1 Multi-Tenancy (Foundational — Everything Depends on This)

B2C has NO `tenantId`. Every document implicitly belongs to the single deployed vendor.

You must:
1. Add `tenantId: { type: ObjectId, required: true }` to **every** schema that is tenant-owned (Members, Wallets, LedgerEntries, Orders, Tiers, EarnRules, Roles, Stores, UserTiers)
2. Lead every compound index with `tenantId`
3. Pass `tenantId` as an explicit argument to every service function
4. Validate in middleware that `req.user.tenantId` matches the resource being accessed

**This is non-negotiable. Missing `tenantId` on even one query creates a cross-tenant data leak.**

---

## 4.2 JWT Authentication (Build from AUTH_GUIDE.md)

B2C uses OAuth2 + opaque tokens + hardcoded pbkdf2 salt. Your AUTH_GUIDE.md already has the correct JWT implementation. Build exactly that. Do not reference B2C's auth at all.

---

## 4.3 MongoDB Multi-Document Transactions (The Correctness Fix)

B2C's earn and redeem paths are sequential `await` calls with no session. If anything fails midway, the DB is left in an inconsistent state (e.g., wallet debited but ledger lot not updated).

Every money path in your system must use:
```javascript
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  // all DB writes in here — either all succeed or all rollback
});
session.endSession();
```

This requires MongoDB Atlas with a replica set — which your TRD already mandates.

---

## 4.4 Idempotency on Money Routes

B2C has no idempotency. If the POS double-submits a purchase, the customer earns double points.

Your system needs:
```javascript
// server/src/models/IdempotencyKey.js
const idempotencyKeySchema = new mongoose.Schema({
  tenantId:   { type: ObjectId, required: true },
  key:        { type: String, required: true },
  response:   { type: Object },             // cache the response
  createdAt:  { type: Date, default: Date.now, expires: 86400 }, // TTL: 24 hours
});
idempotencyKeySchema.index({ tenantId: 1, key: 1 }, { unique: true });
```

Before processing an earn or redeem, check if this key exists. If it does, return the cached response. If not, process and save.

---

## 4.5 Tenant Signup Flow

B2C has no signup — vendors are onboarded externally. You need:
- `POST /api/auth/signup` → creates `Tenant` + `User (MERCHANT_OWNER)` in one MongoDB transaction
- Already designed in your AUTH_GUIDE.md

---

## 4.6 Platform Admin Routes

B2C's "Super Admin" is a separate external service. You own this. Build:
- `GET /api/platform/tenants` — list all tenants
- `PATCH /api/platform/tenants/:id/status` — suspend/activate a tenant
- `GET /api/platform/tenants/:id/usage` — usage metrics for billing

---

## 4.7 Billing and Subscription (No B2C Equivalent)

B2C is a single-vendor tool — no billing. You need:
- `Subscription` model: `{ tenantId, plan, status, currentPeriodStart, currentPeriodEnd }`
- `Invoice` model: `{ tenantId, period, amount, lineItems[], status }`
- `UsageRecord` model: `{ tenantId, metric, period, value }`
- Monthly cron to compute usage (active members, transactions) and generate invoices

---

## 4.8 Audit Log

B2C logs are scattered (console.log, APILogs schema). Your TRD mandates a proper audit trail:

```javascript
// server/src/models/AuditLog.js
const auditLogSchema = new mongoose.Schema({
  tenantId:   { type: ObjectId },
  actorId:    { type: ObjectId, ref: 'User' },
  action:     { type: String, required: true },   // 'MEMBER_CREATED', 'POINTS_ADJUSTED', etc.
  resource:   { type: String },                   // 'Member', 'Order'
  resourceId: { type: ObjectId },
  before:     { type: Object },                   // snapshot before change
  after:      { type: Object },                   // snapshot after change
}, { timestamps: true });
```

---

# PART 5 — YOUR BUILD ORDER (Start Here After Auth)

Now that auth is done (AUTH_GUIDE.md), build in this exact order. Each step depends on the one before it.

---

### Phase 1 — Core Data Models (no business logic yet)
```
1.  constants.js          ← merge yours + B2C constants (Part 3.1)
2.  Member.js             ← your loyalty customer (port from B2C's Users.js, add tenantId)
3.  Wallet.js             ← Part 3.3
4.  LedgerEntry.js        ← Part 3.2
5.  Tier.js               ← Part 3.4
6.  UserTier.js           ← Part 3.4
7.  UserTierLog.js        ← Part 3.4
8.  EarnRule.js           ← Part 3.8
9.  Order.js              ← Part 3.5
10. Store.js              ← simple: { tenantId, name, address, status }
11. Role.js               ← Part 3.6
12. IdempotencyKey.js     ← Part 4.4
13. AuditLog.js           ← Part 4.8
```

### Phase 2 — Services (business logic)
```
14. utils/generateId.js          ← Part 3.13
15. utils/calculateExpiry.js     ← port getDurationTime from B2C (Part 3.12)
16. services/memberService.js    ← CRUD for loyalty members
17. services/ledgerService.js    ← earnPoints() + redeemPoints() (Parts 3.7, 3.8)
18. services/tierService.js      ← checkAndUpgradeTier() (Part 3.9)
19. services/orderService.js     ← createOrder() ties everything together
```

### Phase 3 — Controllers + Routes
```
20. members routes   → GET/POST/PUT /api/members
21. orders routes    → POST /api/orders (earn) + POST /api/orders/redeem
22. tiers routes     → GET/POST/PUT /api/tiers
23. earnRules routes → GET/POST/PUT /api/earn-rules
24. stores routes    → GET/POST/PUT /api/stores
25. analytics routes → GET /api/analytics/dashboard
```

### Phase 4 — Background Jobs
```
26. jobs/pointExpiry.js     ← Part 3.10 (daily)
27. jobs/tierDowngrade.js   ← Part 3.11 (daily)
28. jobs/scheduler.js       ← wire up all jobs with node-cron
```

### Phase 5 — Billing + Platform Admin Routes
```
29. Subscription, Invoice, UsageRecord models
30. Platform admin routes
31. Billing cron (monthly)
```

### Phase 6 — Frontend (React + Vite + Tailwind)
```
32. Auth pages (login, signup)
33. Dashboard (analytics overview)
34. Members management
35. Transaction history
36. Program configuration (tiers, earn rules)
```

---

# PART 6 — COMPLETE SCHEMA MAPPING: B2C → LOYALTYLEDGER

| B2C Collection | B2C Model name | LoyaltyLedger equivalent | Changes |
|---|---|---|---|
| `Admin` (SUPERADMIN) | `admin` | `User` (PLATFORM_ADMIN) | tenantId=null, JWT auth |
| `Admin` (ADMIN) | `admin` | `User` (MERCHANT_*) | tenantId added, JWT auth |
| `Brand` (external) | `brand` | `Tenant` | Single collection, tenantId is the key |
| `SubBrand` | `sub-brand` | Phase 2 only | Skip for MVP |
| `Role` | `role` | `Role` | Add tenantId |
| `Access` | `access` | Seeded MODULE_CODES constants | Keep the access-list pattern |
| `Users` (customers) | `users` | `Member` | Add tenantId, rename customerId → memberId |
| `Wallet` | `Wallet` | `Wallet` | Add tenantId, add unique index |
| `SubBrandWallet` | `sub-brand-wallet` | Phase 2 only | Skip for MVP |
| `Transaction` | `Transaction` | `LedgerEntry` | Add tenantId, add idempotencyKey |
| `SubBrandTransaction` | `sub_brand_transaction` | Phase 2 only | Skip for MVP |
| `Tier` | `tier` | `Tier` | Add tenantId, camelCase fields |
| `UserTier` | (from schema) | `UserTier` | Add tenantId |
| `UserTierLog` | (from schema) | `UserTierLog` | Add tenantId |
| `Offer` | `offer` | `EarnRule` | Simplified — no days/tenders/zones for MVP |
| `Purchase` | `purchase-order` | `Order` | Add tenantId, idempotencyKey |
| `Store` | `stores` | `Store` | Add tenantId |
| `CouponOffer`/`Coupon` | - | Phase 2 | Skip MVP |
| `Campaign`/`CampaignLogs` | - | Phase 2 | Skip MVP |
| `Segment`/`SegmentUser` | - | Phase 2 | Skip MVP |
| `DormantLapserSetting` | - | Phase 2 | Skip MVP |
| `Referral` | - | Phase 2 | Skip MVP |
| `SMSGateway`/`SMSTemplate` | - | Phase 2 | Skip MVP |
| `WhatsappTemplate` | - | Phase 2 | Skip MVP |
| `EmailTemplate` | - | Phase 2 | Skip MVP |

---

# ONE-PAGE SUMMARY FOR QUICK REFERENCE

**Copy these algorithms** (adapt to multi-tenant, add sessions):
- FIFO redeem → `helpers/redeemPoints.js`
- Earn rule evaluation → `helpers/manageOffer.js` (simplified to EarnRule)
- Tier upgrade → `helpers/manageTier.js` (recursive multi-step)
- Tier downgrade cron → `config/cronJobs/downgradeTier.js`
- Point expiry cron → `config/cronJobs/expireUserPoints.js`
- Constants pattern → `config/constants.js`
- Access-list RBAC → `middleware/checkPermission.js` + `schema/Role.js`

**Build fresh** (B2C does these wrong or not at all):
- JWT auth + bcryptjs → AUTH_GUIDE.md
- `tenantId` on every document and every query
- MongoDB `session.withTransaction()` on all earn/redeem paths
- Idempotency-Key deduplication
- Platform Admin surface + tenant billing
- Audit log

**Skip for MVP** (B2C has them, you don't need them yet):
- SubBrand / SubBrandWallet (dual ledger)
- Campaigns, Segments, Dormant/Lapsers
- SMS / WhatsApp / Email / RCS templates
- Coupons and Coupon Offers
- Referral system
- Zones, Regions, Channels, Tags, Departments
