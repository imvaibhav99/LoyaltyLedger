export const USER_ROLES = Object.freeze({
  PLATFORM_ADMIN:   'PLATFORM_ADMIN',
  MERCHANT_OWNER:   'MERCHANT_OWNER',
  MERCHANT_MANAGER: 'MERCHANT_MANAGER',
  MERCHANT_STAFF:   'MERCHANT_STAFF',
  MEMBER:           'MEMBER',
});

export const TOKEN_CONFIG = Object.freeze({
  ACCESS_EXPIRY:  '15m',
  REFRESH_EXPIRY: '7d',
});

export const BCRYPT_ROUNDS = 12;

export const PLANS= Object.freeze({
  STARTER:    'Starter',
  GROWTH:     'Growth',
  ENTERPRISE: 'Enterprise',
})

export const STATUS = Object.freeze({
  ACTIVE:    'Active',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
});

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

