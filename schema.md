# LoyaltyLedger — Complete MongoDB Schema Reference
### Every collection, every field, every index. Copy these into your model files.

> Conventions: ES Modules only (`import/export`). All points/money = integers. Every tenant-owned
> collection has `tenantId` as the first field and the leading element in every compound index.
> All schemas use `{ timestamps: true }` and a shared `toJSON` transform.

---

## Collection Map (MVP — 14 collections)

```
Auth & Tenancy:   Tenant · User
Loyalty Members:  Member · Wallet · LedgerEntry
Programs:         Tier · UserTier · UserTierLog · EarnRule
Commerce:         Order · Store
RBAC:             Role
Ops:              IdempotencyKey · AuditLog
```

---

## 1. Tenant

```javascript
// server/src/models/Tenant.js
import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // Auto-generated on signup: "Zest Cafe" → "zest-cafe"
    },
    plan:   { type: String, enum: ['starter', 'growth', 'enterprise'], default: 'starter' },
    status: { type: String, enum: ['active', 'suspended', 'cancelled'], default: 'active' },
    billingEmail: { type: String, lowercase: true, trim: true },
  },
  { timestamps: true }
);

tenantSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const Tenant = mongoose.model('Tenant', tenantSchema);
```

**Indexes:** `slug` unique (inline).

---

## 2. User

Platform Admin + all merchant staff. `tenantId: null` = PLATFORM_ADMIN.
`roleId` is only populated for MERCHANT_MANAGER / MERCHANT_STAFF (granular permissions).
MERCHANT_OWNER has full access by role alone — no roleId needed.

```javascript
// server/src/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { USER_ROLES, BCRYPT_ROUNDS } from '../config/constants.js';

const userSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
    name:     { type: String, required: true, trim: true },
    email:    { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.MERCHANT_OWNER,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      default: null,
      // Set only for MERCHANT_MANAGER and MERCHANT_STAFF
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    empId:  { type: String },
    // Auto-generated for staff: "EMP-A1B2C3D4". Null for PLATFORM_ADMIN/MERCHANT_OWNER.
  },
  { timestamps: true }
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1 });

userSchema.methods.setPassword = async function (plaintext) {
  this.passwordHash = await bcrypt.hash(plaintext, BCRYPT_ROUNDS);
};
userSchema.methods.verifyPassword = async function (plaintext) {
  return bcrypt.compare(plaintext, this.passwordHash);
};

userSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.id = ret._id; delete ret._id; delete ret.__v; delete ret.passwordHash; return ret;
  },
});

export const User = mongoose.model('User', userSchema);
```

---

## 3. Member

The loyalty customer — created by merchant staff at POS enrollment.
NOT the same as User. Members don't log into the admin dashboard.
Primary lookup key is `phone` (how POS staff find them at checkout).

```javascript
// server/src/models/Member.js
import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:      { type: String, required: true, trim: true },
    phone:     { type: String, required: true, trim: true },
    email:     { type: String, lowercase: true, trim: true },
    memberId:  { type: String },
    // Auto-generated customer-facing ID: "MBR-A1B2C3D4"
    dob:       { type: Date },
    gender:    { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
    address:   { type: String },
    city:      { type: String },
    state:     { type: String },
    pinCode: {
      type: String,
      validate: { validator: v => !v || /^\d{6}$/.test(v), message: 'Invalid pin code' },
    },
    storeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    // Store where they enrolled
    status:         { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' },
    loyaltyStatus:  { type: String, enum: ['LOYAL', 'DORMANT', 'LAPSED'], default: 'LOYAL' },
    isProfileCompleted: { type: Boolean, default: false },
    referralCode:   { type: String },
    referredBy:     { type: String },
  },
  { timestamps: true }
);

memberSchema.index({ tenantId: 1, phone: 1 }, { unique: true });
memberSchema.index({ tenantId: 1, memberId: 1 }, { unique: true, sparse: true });
memberSchema.index({ tenantId: 1, status: 1 });

memberSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const Member = mongoose.model('Member', memberSchema);
```

---

## 4. Wallet

Cached running balance per member. Updated via `$inc` on every earn/redeem/expiry.
The `LedgerEntry` collection is the source of truth — this is a derived cache.
Can always be recomputed as: `db.ledgerEntries.aggregate([{ $match: { memberId } }, { $group: { _id: null, total: { $sum: '$remainingPoints' } } }])`

```javascript
// server/src/models/Wallet.js
import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    balance:  { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// One wallet per member per tenant — unique enforced at DB level
walletSchema.index({ tenantId: 1, memberId: 1 }, { unique: true });
walletSchema.index({ tenantId: 1, balance: 1 });

walletSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const Wallet = mongoose.model('Wallet', walletSchema);
```

---

## 5. LedgerEntry

**The source of truth for all points.** Append-only — never updated or deleted.
Every earn creates a CREDIT lot (`remainingPoints = points`).
Every redeem burns CREDIT lots FIFO (soonest-expiry first), decrementing `remainingPoints`.
Every expiry sets `conclusion = EXPIRED` and subtracts from the wallet.

```javascript
// server/src/models/LedgerEntry.js
import mongoose from 'mongoose';
import { transactionType, transactionPointConclusion, transactionSource } from '../config/constants.js';

const ledgerEntrySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },

    type: {
      type: String,
      enum: Object.values(transactionType), // 'CREDIT' | 'DEBIT'
      required: true,
    },
    points: { type: Number, required: true, min: 0 },
    // Original points in this lot. Set at creation, never changes.

    remainingPoints: { type: Number, min: 0 },
    // CREDIT lots only: starts equal to points, decrements as redeemed.
    // DEBIT summary entries: not applicable (leave null).

    pointExpiryDate: { type: Date },
    // Set on CREDIT lots. The FIFO redemption query sorts by this ASC.

    conclusion: {
      type: String,
      enum: Object.values(transactionPointConclusion),
      default: transactionPointConclusion.ACTIVE,
      // ACTIVE → REDEEMED (when remainingPoints hits 0)
      // ACTIVE → EXPIRED  (when cron runs past pointExpiryDate)
      // ACTIVE → ROLLBACK (when a purchase order is returned)
    },

    source: {
      type: String,
      enum: Object.values(transactionSource),
      // PURCHASE | ENROLLMENT | TIER | ADJUSTMENT | ROLLBACK | REFERRER | CAMPAIGN
    },

    orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    earnRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'EarnRule' },
    // Which rule generated this CREDIT. Null for manual adjustments, tier bonuses etc.

    pointsMultiplier: { type: Number, min: 1, default: 1 },
    isRollback:       { type: Boolean, default: false },

    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Staff who triggered this entry. null = system/cron.

    note: { type: String, trim: true },
    // Used for ADJUSTMENT entries to record the reason.

    idempotencyKey: { type: String, unique: true, sparse: true },
    // Prevents duplicate earn/burn. Set by the calling service.
  },
  { timestamps: true }
);

// The critical index: used by FIFO redemption query AND expiry cron
ledgerEntrySchema.index({ tenantId: 1, memberId: 1, conclusion: 1, pointExpiryDate: 1 });
ledgerEntrySchema.index({ tenantId: 1, orderId: 1 });
ledgerEntrySchema.index({ tenantId: 1, source: 1, createdAt: -1 });
ledgerEntrySchema.index({ tenantId: 1, createdAt: -1 }); // transaction history

ledgerEntrySchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
```

---

## 6. Tier

Loyalty tier definitions. Configured by MERCHANT_OWNER.
Tiers chain together: Bronze → Silver → Gold via `upgradePolicyTierId`.
The `pointsMultiplier` means Gold members earn 2x points on the same spend.

```javascript
// server/src/models/Tier.js
import mongoose from 'mongoose';
import { tierDurationType, tierAssociateRule, statusAIP } from '../config/constants.js';

const tierSchema = new mongoose.Schema(
  {
    tenantId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:             { type: String, required: true, trim: true },
    isDefault:        { type: Boolean, default: false },
    // isDefault: true = new members are enrolled into this tier automatically.
    // Exactly one tier per tenant should have isDefault: true.

    status:           { type: String, enum: Object.values(statusAIP), default: statusAIP.PENDING },
    narration:        { type: String, trim: true },
    pointsMultiplier: { type: Number, min: 1, default: 1 },

    durationType: { type: String, enum: Object.values(tierDurationType), required: true },
    duration:     { type: Number, required: true, min: 1 },
    // A member stays in a tier for `duration` units of `durationType`.
    // After this window, the downgrade cron checks retain thresholds.

    // ── Upgrade policy (how to move to the next tier) ──────────────────────
    upgradePolicyTierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' },
    // Points to the tier above this one. null = this is the top tier.
    upgradeSpends:    { type: Number, min: 0, default: 0 },
    upgradeVisits:    { type: Number, min: 0, default: 0 },
    upgradePoints:    { type: Number, min: 0, default: 0 }, // bonus on upgrade
    upgradeRule: {
      type: String,
      enum: Object.values(tierAssociateRule),
      default: tierAssociateRule.OR,
      // OR  → either spends OR visits threshold is met → upgrade
      // AND → both spends AND visits must be met → upgrade
    },

    // ── Downgrade / retain policy (how to fall back) ───────────────────────
    downgradePolicyTierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' },
    retainSpends:     { type: Number, min: 0, default: 0 },
    retainVisits:     { type: Number, min: 0, default: 0 },
    retainPoints:     { type: Number, min: 0, default: 0 },
    retainRule: {
      type: String,
      enum: Object.values(tierAssociateRule),
      default: tierAssociateRule.OR,
    },
  },
  { timestamps: true }
);

tierSchema.index({ tenantId: 1, status: 1 });
tierSchema.index({ tenantId: 1, isDefault: 1 });

tierSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const Tier = mongoose.model('Tier', tierSchema);
```

---

## 7. UserTier

One document per member — tracks their current tier and when their tier window expires.
Updated in-place on upgrade or downgrade.

```javascript
// server/src/models/UserTier.js
import mongoose from 'mongoose';

const userTierSchema = new mongoose.Schema(
  {
    tenantId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    tierId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tier',   required: true },
    tierExpiryDate: { type: Date },
    // When this expires, the nightly downgrade cron fires.
    // null for the default (lowest) tier — never expires.
  },
  { timestamps: true }
);

userTierSchema.index({ tenantId: 1, memberId: 1 }, { unique: true });
userTierSchema.index({ tenantId: 1, tierExpiryDate: 1 }); // downgrade cron query

export const UserTier = mongoose.model('UserTier', userTierSchema);
```

---

## 8. UserTierLog

Immutable history of every tier change. Append-only, never updated.

```javascript
// server/src/models/UserTierLog.js
import mongoose from 'mongoose';

const userTierLogSchema = new mongoose.Schema(
  {
    tenantId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    oldTierId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' },
    newTierId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tier',   required: true },
    action:           { type: String, enum: ['UPGRADE', 'DOWNGRADE'], required: true },
    points:           { type: Number, default: 0 }, // bonus points credited on upgrade
    triggeredByOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    // null when triggered by downgrade cron
  },
  { timestamps: true }
);

userTierLogSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });

export const UserTierLog = mongoose.model('UserTierLog', userTierLogSchema);
```

---

## 9. EarnRule

Defines how members earn points. One or more rules per tenant.
A rule can be tier-specific (`tierId` set) or universal (`tierId: null` = applies to all tiers).
The earn service picks the most specific matching rule.

```javascript
// server/src/models/EarnRule.js
import mongoose from 'mongoose';
import { statusAI } from '../config/constants.js';

const earnRuleSchema = new mongoose.Schema(
  {
    tenantId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:            { type: String, required: true, trim: true },
    tierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tier',
      default: null,
      // null = rule applies to ALL tiers
    },
    transactionUnit: { type: Number, required: true, min: 1 },
    pointsPerUnit:   { type: Number, required: true, min: 1 },
    // Formula: floor(billAmount / transactionUnit) * pointsPerUnit * tier.pointsMultiplier
    // Example: transactionUnit:10, pointsPerUnit:1 → 1 point per ₹10 spent

    maxPoints: { type: Number, min: 0, default: 0 },
    // Per-transaction cap. 0 = no cap.

    expiryDays: { type: Number, required: true, min: 1 },
    // Points earned under this rule expire after N days.

    status: { type: String, enum: Object.values(statusAI), default: statusAI.ACTIVE },

    // Phase 2 fields (don't add yet — add when needed):
    // minPurchaseAmount: Number
    // applyDays: [String]  e.g. ['SATURDAY', 'SUNDAY']
    // startDate / endDate: Date
    // storeIds: [ObjectId]
  },
  { timestamps: true }
);

earnRuleSchema.index({ tenantId: 1, status: 1 });
earnRuleSchema.index({ tenantId: 1, tierId: 1, status: 1 });

earnRuleSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const EarnRule = mongoose.model('EarnRule', earnRuleSchema);
```

---

## 10. Order

A POS purchase. Creating an order triggers the earn + optional redeem flow.
`idempotencyKey` = if POS re-submits the same bill, return cached response without re-processing.

```javascript
// server/src/models/Order.js
import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    skuCode:  { type: String },
    skuName:  { type: String },
    quantity: { type: Number, min: 1, required: true },
    rate:     { type: Number, min: 0, required: true },
    amount:   { type: Number, min: 0, required: true },
    status:   {
      type: String,
      enum: ['COMPLETED', 'RETURNED', 'PARTIAL_RETURNED'],
      default: 'COMPLETED',
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    storeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    actorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // The staff member who created this order at POS

    billId:      { type: String, required: true },
    items:       [itemSchema],

    totalAmount:  { type: Number, required: true, min: 0 },
    offerDiscount:{ type: Number, default: 0, min: 0 },
    // Points burned = offerDiscount value in currency (1 point = ₹1 by default, configurable)
    finalAmount:  { type: Number, min: 0 },

    walletUsed:   { type: Boolean, default: false },
    pointsEarned: { type: Number, default: 0, min: 0 },
    pointsBurned: { type: Number, default: 0, min: 0 },
    // Denormalized for display in order history. Source of truth is LedgerEntry.

    status: {
      type: String,
      enum: ['COMPLETED', 'FULLY_RETURNED', 'PARTIAL_RETURNED'],
      default: 'COMPLETED',
    },
    orderDate: { type: Date, default: Date.now },

    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, memberId: 1, orderDate: -1 });
orderSchema.index({ tenantId: 1, billId: 1 });
orderSchema.index({ tenantId: 1, orderDate: -1 });

orderSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const Order = mongoose.model('Order', orderSchema);
```

---

## 11. Store

Physical or online locations within a tenant. Members enroll at a store.
Orders are created at a store. Analytics can be filtered by store.

```javascript
// server/src/models/Store.js
import mongoose from 'mongoose';
import { statusAI } from '../config/constants.js';

const storeSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:     { type: String, required: true, trim: true },
    code:     { type: String, trim: true },
    address:  { type: String, trim: true },
    city:     { type: String, trim: true },
    state:    { type: String, trim: true },
    pinCode:  { type: String, trim: true },
    type: {
      type: String,
      enum: ['FLAGSHIP', 'OUTLET', 'FRANCHISE', 'ONLINE'],
      default: 'OUTLET',
    },
    status: { type: String, enum: Object.values(statusAI), default: statusAI.ACTIVE },
  },
  { timestamps: true }
);

storeSchema.index({ tenantId: 1, status: 1 });
storeSchema.index({ tenantId: 1, code: 1 }, { unique: true, sparse: true });

storeSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const Store = mongoose.model('Store', storeSchema);
```

---

## 12. Role

Granular permission sets for MERCHANT_MANAGER and MERCHANT_STAFF.
MERCHANT_OWNER → full access by role (no roleId needed).
PLATFORM_ADMIN → bypasses all permission checks.

```javascript
// server/src/models/Role.js
import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema(
  {
    module: { type: String, required: true },
    // 'members'|'transactions'|'analytics'|'programs'|
    // 'staff'|'roles'|'stores'|'billing'|'adjustments'
    read:  { type: Boolean, default: false },
    write: { type: Boolean, default: false },
  },
  { _id: false }
);

const roleSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:     { type: String, required: true, trim: true },
    level: {
      type: Number,
      enum: [1, 2],
      default: 1,
      // 1 = staff-level, 2 = manager-level
      // Level 2 required for sensitive ops like manual point adjustments
    },
    access: [permissionSchema],
  },
  { timestamps: true }
);

roleSchema.index({ tenantId: 1 });

roleSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

export const Role = mongoose.model('Role', roleSchema);
```

---

## 13. IdempotencyKey

Prevents double-processing when POS retries a request.
Written inside the same MongoDB transaction as the earn/redeem effect.
Auto-expires after 24 hours via MongoDB TTL.

```javascript
// server/src/models/IdempotencyKey.js
import mongoose from 'mongoose';

const idempotencyKeySchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  key:        { type: String, required: true },
  statusCode: { type: Number },
  response:   { type: mongoose.Schema.Types.Mixed },
  createdAt:  { type: Date, default: Date.now, expires: 86400 }, // TTL 24h
});

idempotencyKeySchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
```

---

## 14. AuditLog

Immutable append-only trail for all sensitive actions. Never updated.

```javascript
// server/src/models/AuditLog.js
import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // null = system/cron
    action:     { type: String, required: true },
    // 'MEMBER_CREATED' | 'POINTS_EARNED' | 'POINTS_REDEEMED' | 'POINTS_ADJUSTED'
    // 'TIER_UPGRADED' | 'TIER_DOWNGRADED' | 'STAFF_CREATED' | 'ORDER_ROLLED_BACK'
    // 'TENANT_SUSPENDED' | 'EARN_RULE_UPDATED'
    resource:   { type: String },    // 'Member' | 'Order' | 'Tenant'
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    before:     { type: mongoose.Schema.Types.Mixed },
    after:      { type: mongoose.Schema.Types.Mixed },
    ip:         { type: String },
    meta:       { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, actorId: 1, createdAt: -1 });
auditLogSchema.index({ tenantId: 1, resource: 1, resourceId: 1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
```

---

## Complete constants.js

```javascript
// server/src/config/constants.js

export const USER_ROLES = Object.freeze({
  PLATFORM_ADMIN:   'PLATFORM_ADMIN',
  MERCHANT_OWNER:   'MERCHANT_OWNER',
  MERCHANT_MANAGER: 'MERCHANT_MANAGER',
  MERCHANT_STAFF:   'MERCHANT_STAFF',
  MEMBER:           'MEMBER',
});

export const TOKEN_CONFIG  = Object.freeze({ ACCESS_EXPIRY: '15m', REFRESH_EXPIRY: '7d' });
export const BCRYPT_ROUNDS = 12;

export const statusAI  = Object.freeze({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' });
export const statusAIP = Object.freeze({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', PENDING: 'PENDING' });

export const transactionType = Object.freeze({ CREDIT: 'CREDIT', DEBIT: 'DEBIT' });

export const transactionPointConclusion = Object.freeze({
  ACTIVE: 'ACTIVE', REDEEMED: 'REDEEMED', EXPIRED: 'EXPIRED', ROLLBACK: 'ROLLBACK',
});

export const transactionSource = Object.freeze({
  PURCHASE: 'PURCHASE', ENROLLMENT: 'ENROLLMENT', TIER: 'TIER',
  REFERRER: 'REFERRER', REFERREE: 'REFERREE', CAMPAIGN: 'CAMPAIGN',
  ADJUSTMENT: 'ADJUSTMENT', ROLLBACK: 'ROLLBACK',
});

export const tierDurationType = Object.freeze({
  DAILY: 'DAILY', MONTHLY: 'MONTHLY', CALENDER_YEARLY: 'CALENDER_YEARLY',
  FINANCIAL_YEARLY: 'FINANCIAL_YEARLY', HALF_YEARLY: 'HALF_YEARLY', QUARTERLY: 'QUARTERLY',
});

export const tierAssociateRule = Object.freeze({ AND: 'AND', OR: 'OR' });
export const tierAction        = Object.freeze({ UPGRADE: 'UPGRADE', DOWNGRADE: 'DOWNGRADE' });

export const MODULES = Object.freeze({
  MEMBERS: 'members', TRANSACTIONS: 'transactions', ANALYTICS: 'analytics',
  PROGRAMS: 'programs', STAFF: 'staff', ROLES: 'roles',
  STORES: 'stores', BILLING: 'billing', ADJUSTMENTS: 'adjustments',
});
```

---

## Index Summary

| Collection | Index | Type |
|---|---|---|
| tenants | `slug` | unique |
| users | `{ tenantId, email }` | unique |
| users | `{ tenantId, role }` | standard |
| members | `{ tenantId, phone }` | unique |
| members | `{ tenantId, memberId }` | unique sparse |
| members | `{ tenantId, status }` | standard |
| wallets | `{ tenantId, memberId }` | unique |
| ledgerEntries | `{ tenantId, memberId, conclusion, pointExpiryDate }` | standard |
| ledgerEntries | `{ tenantId, orderId }` | standard |
| ledgerEntries | `{ tenantId, createdAt }` | standard |
| tiers | `{ tenantId, status }` | standard |
| tiers | `{ tenantId, isDefault }` | standard |
| userTiers | `{ tenantId, memberId }` | unique |
| userTiers | `{ tenantId, tierExpiryDate }` | standard |
| userTierLogs | `{ tenantId, memberId, createdAt }` | standard |
| earnRules | `{ tenantId, tierId, status }` | standard |
| orders | `{ tenantId, memberId, orderDate }` | standard |
| orders | `{ tenantId, billId }` | standard |
| stores | `{ tenantId, code }` | unique sparse |
| roles | `{ tenantId }` | standard |
| idempotencyKeys | `{ tenantId, key }` | unique |
| auditLogs | `{ tenantId, createdAt }` | standard |

---

## Entity Relationship (text)

```
Tenant
  ├─1:N─ User (MERCHANT_OWNER / MANAGER / STAFF)
  │         └─ User.roleId → Role.access[]
  ├─1:N─ Store
  ├─1:N─ Tier  ──self-ref chain──▶ Tier (upgradePolicyTierId)
  ├─1:N─ EarnRule  ──optional──▶ Tier
  └─1:N─ Member
            ├─1:1─ Wallet
            ├─1:1─ UserTier ──▶ Tier
            ├─1:N─ UserTierLog
            └─1:N─ Order
                      └─ triggers ──▶
                            LedgerEntry (CREDIT, earn)
                            LedgerEntry (DEBIT, redeem)
                            Wallet.$inc (balance update)
                            UserTier check (upgrade?)
                            AuditLog

Platform:
  User (PLATFORM_ADMIN, tenantId=null) ──manages──▶ all Tenants
```
