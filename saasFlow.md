# LoyaltyLedger — Complete SaaS Flow Document
### Every user journey, every data flow, every page, every API operation.

---

## 1. System Actors

| Actor | Who | tenantId in JWT | Can do |
|---|---|---|---|
| **PLATFORM_ADMIN** | You (Vaibhav) | `null` | Everything platform-wide |
| **MERCHANT_OWNER** | Business owner who signed up | ObjectId | Full access within their tenant |
| **MERCHANT_MANAGER** | Manager created by owner | ObjectId | As defined in their Role.access[] (level 2) |
| **MERCHANT_STAFF** | Cashier/POS operator | ObjectId | As defined in their Role.access[] (level 1) |
| **System/Cron** | Background jobs | N/A | Direct DB, no HTTP auth |

---

## 2. Site Map (Frontend Pages)

```
PUBLIC (no auth)
 ├─ /                     Landing page
 ├─ /login                Login (all users — same page)
 └─ /register             Merchant signup

MERCHANT APP  (auth required, tenant-scoped, role-gated)
 ├─ /app                  Dashboard (analytics, KPIs, liability)
 ├─ /app/members          Member list
 ├─ /app/members/:id      Member detail (profile + ledger)
 ├─ /app/pos              POS Counter (earn / redeem)       [staff+]
 ├─ /app/program          Earn rule + expiry config         [owner/manager]
 ├─ /app/tiers            Tier management                   [owner/manager]
 ├─ /app/stores           Store management                  [owner]
 ├─ /app/billing          Billing & invoices                [owner]
 ├─ /app/audit            Audit log viewer                  [owner/manager]
 ├─ /app/team             Staff management                  [owner]
 └─ /app/settings         Tenant & account settings

PLATFORM CONSOLE  (PLATFORM_ADMIN only)
 ├─ /platform             Cross-tenant metrics dashboard
 ├─ /platform/tenants     Tenant list + detail + suspend
 └─ /platform/plans       Subscription plan management
```

---

## 3. Auth & Routing Rules (Frontend)

- Visiting `/app/*` without a valid token → redirect to `/login`
- After successful login → redirect to `/app` for merchant users, `/platform` for PLATFORM_ADMIN
- A `401` API response (expired access token) → axios interceptor silently refreshes; if refresh fails → redirect to `/login`
- Visiting a role-gated page without the role → redirect to `/app` with "not authorized" toast
- Items the user can't access are hidden from sidebar AND blocked server-side (403)

---

## 4. Page Detail

| Page | Purpose | Key elements | Primary actions |
|---|---|---|---|
| `/` | Convert visitors | Pitch, feature highlights | **Start free**→`/register` · **Login**→`/login` |
| `/register` | Create merchant account | businessName, name, email, password | **Create account**→`/app` |
| `/login` | Authenticate | Email, password | **Sign in**→`/app` or `/platform` |
| `/app` | Program health | Metric cards, charts, Liability card, onboarding checklist (empty state) | checklist items→config pages |
| `/app/members` | Browse members | Searchable paginated list | **Add member**→modal · row→`/app/members/:id` |
| `/app/members/:id` | Member detail | Profile, balance, ledger history | **Adjust points** (owner)→modal |
| `/app/pos` | POS earn/redeem | Member search, amount, rewards list | **Add purchase** → earn · **Redeem** → burn |
| `/app/program` | Configure earn rules | Earn rule form + expiry policy | **Save**→audited update |
| `/app/tiers` | Manage tier ladder | Tier list with upgrade/downgrade rules | **Add tier**→modal |
| `/app/stores` | Manage locations | Store list | **Add store**→modal |
| `/app/billing` | Usage & invoices | Usage vs plan limits, invoice list | invoice row→detail |
| `/app/audit` | Accountability log | Filterable audit table | filters→query · row→before/after |
| `/app/team` | Staff accounts | User list | **Add staff**→modal with role select |
| `/app/settings` | Account settings | Profile, business info | **Save** |
| `/platform` | Operate SaaS | Cross-tenant metrics | nav to tenants/plans |
| `/platform/tenants` | Manage merchants | Tenant list | row→detail · **Suspend** |
| `/platform/plans` | Plan management | Plan list with pricing | **Add/Edit plan**→modal |

---

## 5. Backend Data Flows — Master Reference

### 5.1 Platform Admin Bootstrap (one-time setup)

**Trigger:** `npm run seed`

```
scripts/seedAdmin.js
  ↓
connectDB()
  ↓
User.findOne({ email: ADMIN_EMAIL })
  if exists → skip
  ↓
new User({ tenantId: null, role: PLATFORM_ADMIN, email, name })
user.setPassword(password)   → bcrypt.hash(password, 12)
user.save()
  ↓
"Platform Admin created"
mongoose.disconnect()
```

---

### 5.2 Merchant Signup

**POST /api/auth/signup** — `{ businessName, ownerName, email, password, plan? }`

```
validate(signupSchema)
  ↓
Check User.findOne({ email }) → 409 if exists
  ↓
slug = slugify(businessName)  →  "Zest Cafe" → "zest-cafe"
Check Tenant.findOne({ slug }) → 409 if taken
  ↓
START session.withTransaction()
  [1] Tenant.create([{ businessName, slug, plan, billingEmail: email }], { session })
  [2] User.create([{ tenantId: tenant._id, name: ownerName, email, role: MERCHANT_OWNER }], { session })
  [3] user.setPassword(password)
  [4] user.save({ session })
COMMIT
  ↓
signAccessToken({ userId, tenantId: tenant._id, role: MERCHANT_OWNER })
signRefreshToken({ userId })
  ↓
201: { user, tenant, accessToken, refreshToken }
```

---

### 5.3 Login (All Users — Same Endpoint)

**POST /api/auth/login** — `{ email, password }`

```
validate(loginSchema)
  ↓
User.findOne({ email }).select('+passwordHash')
  → 401 "Invalid credentials" if not found
  ↓
user.verifyPassword(password)  → bcrypt.compare
  → 401 "Invalid credentials" if wrong
  ↓
accessToken = jwt.sign({ userId, tenantId, role }, ACCESS_SECRET, '15m')
refreshToken = jwt.sign({ userId }, REFRESH_SECRET, '7d')
  ↓
200: { user, accessToken, refreshToken }
```

---

### 5.4 Every Authenticated Request — Middleware Chain

```
Request
  │
  ├─ validate(zodSchema)              400 if body/params wrong
  ├─ authenticate                     verify JWT → set req.user { userId, tenantId, role }
  ├─ requireRole(...roles)            403 if role not allowed
  ├─ [money routes] idempotency       replay if key seen; else set req.idempotencyKey
  ├─ [manager/staff] requirePermission(module, action)
  │      load user.roleId → Role.access[] → 403 if not granted
  └─ controller → service(tenantId, ...) → DB (always filtered by tenantId)
```

---

### 5.5 Member Enrollment

**POST /api/members** — `{ name, phone, email?, dob?, storeId? }`

```
authenticate → requireRole(OWNER, MANAGER, STAFF) → requirePermission('members', 'write')
  ↓
Check Member.findOne({ tenantId, phone }) → 409 if exists
  ↓
START session.withTransaction()
  [1] Member.create([{ tenantId, name, phone, memberId: generateId('MBR'), ... }], { session })
  [2] Wallet.create([{ tenantId, memberId: member._id, balance: 0 }], { session })
  [3] defaultTier = Tier.findOne({ tenantId, isDefault: true, status: ACTIVE })
  [4] UserTier.create([{ tenantId, memberId, tierId: defaultTier._id }], { session })
  [5] If enrollment bonus configured:
        LedgerEntry.create([CREDIT ENROLLMENT], { session })
        Wallet.updateOne($inc balance, { session })
  [6] AuditLog.create([{ action: MEMBER_CREATED }], { session })
COMMIT
  ↓
201: { member, wallet }
```

---

### 5.6 Create Order — Earn + Optional Redeem (Core Flow)

**POST /api/orders** — `{ memberId, billId, items[], totalAmount, storeId, walletUsed?, offerDiscount? }`
**Header:** `Idempotency-Key: <pos-unique-key>`

```
authenticate → requireRole(OWNER, MANAGER, STAFF) → requirePermission('transactions', 'write')
  ↓
idempotency middleware:
  IdempotencyKey.findOne({ tenantId, key })
  if found → return cached response immediately (no re-processing)
  ↓
validate → check member exists + is active
  ↓
if walletUsed && offerDiscount > 0:
  wallet = Wallet.findOne({ tenantId, memberId })
  if wallet.balance < offerDiscount → 400 "Insufficient points"
  ↓
START session.withTransaction()
  ─── REDEEM (if walletUsed) ─────────────────────────────────────────────
  [1] FIFO burn:
      lots = LedgerEntry.find({ tenantId, memberId, type: CREDIT,
               remainingPoints: {$gt:0}, pointExpiryDate: {$gte: now},
               conclusion: ACTIVE }).sort({ pointExpiryDate: 1, createdAt: 1 })

      remaining = offerDiscount
      for each lot:
        use = min(lot.remainingPoints, remaining)
        LedgerEntry.updateOne(_id: lot._id,
          { $inc: { remainingPoints: -use },
            $set: { conclusion: use === lot.remainingPoints ? REDEEMED : ACTIVE }
          }, { session })
        remaining -= use

  [2] Wallet.updateOne({ tenantId, memberId }, { $inc: { balance: -offerDiscount } }, { session })
  [3] LedgerEntry.create([{ type: DEBIT, points: offerDiscount, source: PURCHASE }], { session })

  ─── CREATE ORDER ────────────────────────────────────────────────────────
  [4] Order.create([{ tenantId, memberId, storeId, actorId, billId, items,
                       totalAmount, offerDiscount, walletUsed, idempotencyKey }], { session })

  ─── EARN ────────────────────────────────────────────────────────────────
  [5] userTier = UserTier.findOne({ tenantId, memberId })
      tier     = Tier.findById(userTier.tierId)
      earnRule = EarnRule.findOne({ tenantId, status: ACTIVE,
                   $or: [{ tierId: userTier.tierId }, { tierId: null }] })

      if earnRule:
        multiplier = tier.pointsMultiplier || 1
        points = floor((totalAmount / earnRule.transactionUnit)
                       * earnRule.pointsPerUnit * multiplier)
        if earnRule.maxPoints > 0: points = min(points, earnRule.maxPoints)
        expiryDate = today + earnRule.expiryDays

  [6] if points > 0:
        LedgerEntry.create([{ type: CREDIT, points, remainingPoints: points,
                               pointExpiryDate: expiryDate, conclusion: ACTIVE,
                               source: PURCHASE, orderId, earnRuleId, pointsMultiplier,
                               actorId }], { session })
        Wallet.updateOne({ tenantId, memberId }, { $inc: { balance: points } }, { session })

  [7] Order.updateOne(_id: order._id,
        { pointsEarned: points, pointsBurned: offerDiscount,
          finalAmount: totalAmount - offerDiscount }, { session })

  ─── TIER CHECK ──────────────────────────────────────────────────────────
  [8] checkAndUpgradeTier({ tenantId, memberId, order }, session)
      → see Flow 5.8 below

  ─── COMMIT IDEMPOTENCY RECORD ───────────────────────────────────────────
  [9] IdempotencyKey.create([{ tenantId, key, statusCode: 201,
                                response: { order, pointsEarned: points } }], { session })

  [10] AuditLog.create([{ action: POINTS_EARNED, resource: Order }], { session })
COMMIT
  ↓
201: { order, pointsEarned, newBalance }
```

---

### 5.7 Manual Point Adjustment

**POST /api/members/:id/adjust** — `{ points (signed int), note }` (positive = add, negative = deduct)
**Auth:** MERCHANT_OWNER only, or level-2 role with adjustments:write

```
authenticate → requireRole(OWNER, MANAGER) → requirePermission('adjustments', 'write')
              → checkRoleLevel(2)  [if MANAGER — only level 2 can adjust]
  ↓
validate: points !== 0, note required
  ↓
if points < 0:
  wallet = Wallet.findOne({ tenantId, memberId })
  if wallet.balance + points < 0 → 400 "Cannot deduct more than available balance"
  ↓
START session.withTransaction()
  [1] LedgerEntry.create([{
        tenantId, memberId, type: points > 0 ? CREDIT : DEBIT,
        points: Math.abs(points), source: ADJUSTMENT, actorId, note,
        ...(points > 0 ? { remainingPoints: points, conclusion: ACTIVE } : {})
      }], { session })
  [2] Wallet.updateOne({ tenantId, memberId }, { $inc: { balance: points } }, { session })
  [3] AuditLog.create([{ action: POINTS_ADJUSTED, before: { balance: old },
                          after: { balance: old + points }, meta: { note } }], { session })
COMMIT
  ↓
200: { newBalance, ledgerEntry }
```

---

### 5.8 Tier Upgrade Check (Inside Every Order Transaction)

Called from within the order transaction in step [8] above. Receives the open `session`.

```
tierService.checkAndUpgradeTier({ tenantId, memberId, order }, session)
  ↓
userTier    = UserTier.findOne({ tenantId, memberId }).session(session)
currentTier = Tier.findOne({ _id: userTier.tierId, status: ACTIVE }).session(session)
  → if !currentTier.upgradePolicyTierId → return (no upgrade path)
  ↓
stats = Order.aggregate([
  $match: { tenantId, memberId, orderDate: {$gte: userTier.updatedAt}, status: COMPLETED }
  $group: { _id: null, totalAmount: {$sum:'$totalAmount'}, count: {$sum:1} }
]).session(session)
  ↓
visitOk = stats.count >= currentTier.upgradeVisits
spendOk = stats.totalAmount >= currentTier.upgradeSpends

eligible = currentTier.upgradeRule === AND
  ? visitOk && spendOk
  : visitOk || spendOk
  ↓
if !eligible → return
  ↓
if currentTier.upgradePoints > 0:
  LedgerEntry.create([CREDIT TIER bonus], { session })
  Wallet.updateOne($inc balance, { session })
  ↓
newExpiryDate = calculateExpiry(currentTier.durationType, currentTier.duration)
UserTier.updateOne({ memberId }, { tierId: upgradePolicyTierId, tierExpiryDate: newExpiryDate }, { session })
UserTierLog.create([{ action: UPGRADE, oldTierId, newTierId, points: bonus }], { session })
  ↓
[Multi-step: check if also eligible for the tier above that]
→ recurse: checkAndUpgradeTier({ tierId: upgradePolicyTierId }, session)
```

---

### 5.9 Point Expiry Cron (Nightly)

**Schedule:** daily at 00:05 AM  
**File:** `server/src/jobs/pointExpiry.js`

```
expireUserPoints()
  ↓
today = new Date(), set to midnight UTC
  ↓
expiredLots = LedgerEntry.find({
  type: CREDIT,
  conclusion: ACTIVE,
  pointExpiryDate: { $lte: today },
  remainingPoints: { $gt: 0 }
})
  ↓
for each lot:
  session.withTransaction()
    LedgerEntry.updateOne(_id: lot._id, { conclusion: EXPIRED })
    Wallet.updateOne({ tenantId: lot.tenantId, memberId: lot.memberId },
      { $inc: { balance: -lot.remainingPoints } })
    AuditLog.create({ action: POINTS_EXPIRED, actorId: null, tenantId: lot.tenantId })
  session.endSession()
  ↓
console.log(`[pointExpiry] N lots expired`)
```

---

### 5.10 Tier Downgrade Cron (Nightly)

**Schedule:** daily at 00:10 AM  
**File:** `server/src/jobs/tierDowngrade.js`

```
downgradeTiers()
  ↓
today = midnight UTC
  ↓
expiredUserTiers = UserTier.find({ tierExpiryDate: { $lte: today } })
  ↓
for each userTier:
  tier = Tier.findById(userTier.tierId)
  if !tier.downgradePolicyTierId → skip

  stats = Order.aggregate [
    $match { memberId, orderDate: { $gte: userTier.updatedAt, $lte: tierExpiryDate } }
    $group { totalAmount: $sum, count: $sum 1 }
  ]

  visitFails  = !stats || stats.count < tier.retainVisits
  spendFails  = !stats || stats.totalAmount < tier.retainSpends

  shouldDowngrade = tier.retainRule === AND
    ? visitFails && spendFails
    : visitFails || spendFails

  if !shouldDowngrade → skip (member kept their tier)

  UserTier.updateOne({ memberId }, { tierId: tier.downgradePolicyTierId })
  UserTierLog.create({ action: DOWNGRADE, oldTierId, newTierId: tier.downgradePolicyTierId })
  ↓
console.log(`[tierDowngrade] N members downgraded`)
```

---

### 5.11 Token Refresh

**POST /api/auth/refresh** — `{ refreshToken }`

```
validate(refreshSchema)
  ↓
jwt.verify(refreshToken, REFRESH_SECRET)
  → 401 if invalid or expired
  ↓
User.findById(payload.userId)
  → 401 "User no longer exists" if not found
  ↓
new accessToken = signAccessToken({ userId, tenantId: user.tenantId, role: user.role })
new refreshToken = signRefreshToken({ userId })
  ↓
200: { accessToken, refreshToken }
```

Note: User is re-fetched on every refresh to embed the latest role/tenantId. If a user's role changes, the next refresh issues a token with the new role (max 15-min delay for active tokens).

---

## 6. Data Write Summary

| Operation | Collections Written | Session? | Idempotent? |
|---|---|---|---|
| Merchant signup | Tenant + User | YES | No (once-off) |
| Login | none | No | N/A |
| Member enrollment | Member + Wallet + UserTier + LedgerEntry + AuditLog | YES | No |
| Create order (earn) | Order + LedgerEntry(CREDIT) + Wallet + IdempotencyKey + AuditLog | YES | YES |
| Create order (earn+redeem) | All above + LedgerEntry(DEBIT) | YES | YES |
| Tier upgrade | UserTier + UserTierLog + LedgerEntry + Wallet | Inside order txn | N/A |
| Manual adjustment | LedgerEntry + Wallet + AuditLog | YES | YES |
| Point expiry cron | LedgerEntry + Wallet + AuditLog | YES per lot | By design |
| Tier downgrade cron | UserTier + UserTierLog | NO | By design |
| Staff creation | User + AuditLog | NO | No |

---

## 7. RBAC Decision Tree

```
Request hits protected route
  ↓
PLATFORM_ADMIN? → allow everything
  ↓
MERCHANT_OWNER? → allow everything within their tenantId
  ↓
requireRole([...]) → 403 if role not in list
  ↓
requirePermission(module, action):
  User.findById(userId).populate('roleId')
  role.access.find(a => a.module === module && a[action] === true)
  → 403 if not found
  ↓
[sensitive routes] checkRoleLevel(2):
  role.level >= 2 required (manager, not staff)
  → 403 if level 1
  ↓
controller
```

---

## 8. Error Response Standard

All errors return the same envelope:

```json
{ "success": false, "message": "Human-readable error", "details": [...] }
```

| Code | Meaning | When |
|---|---|---|
| 400 | Validation / business rule failed | Invalid body, insufficient balance |
| 401 | Not authenticated | Missing/expired/invalid token |
| 403 | Not authorized | Wrong role, wrong permission |
| 404 | Resource not found | memberId, orderId doesn't exist |
| 409 | Conflict | Duplicate email, duplicate phone |
| 429 | Rate limited | Too many auth attempts |
| 500 | Unexpected server error | Unhandled exception |

---

## 9. State Machines

### Member status
```
PENDING → ACTIVE (on profile completion)
ACTIVE  → INACTIVE (manually deactivated by owner)
ACTIVE  → BLOCKED (loyalty abuse detected)
INACTIVE → ACTIVE (reactivated)
```

### LedgerEntry conclusion
```
ACTIVE → REDEEMED  (when remainingPoints reaches 0 during a redemption)
ACTIVE → EXPIRED   (when nightly cron runs past pointExpiryDate)
ACTIVE → ROLLBACK  (when the associated purchase order is returned)
```

### Tier membership
```
DEFAULT_TIER → HIGHER_TIER    (checkAndUpgradeTier fires on every order)
HIGHER_TIER  → LOWER_TIER     (downgradeTier cron fires after tierExpiryDate)
```

### Order status
```
COMPLETED → PARTIAL_RETURNED  (some items returned, partial point rollback)
COMPLETED → FULLY_RETURNED    (all items returned, full point rollback)
```
