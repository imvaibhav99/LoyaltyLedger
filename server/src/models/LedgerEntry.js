import mongoose from 'mongoose';
import { transactionType, transactionPointConclusion, transactionSource } from '../config/constants.js';

// The source of truth for all points. Append-only — never updated or deleted,
// except remainingPoints/conclusion which change as CREDIT lots are consumed.
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
ledgerEntrySchema.index({ tenantId: 1, createdAt: -1 });

ledgerEntrySchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);

export default LedgerEntry;
