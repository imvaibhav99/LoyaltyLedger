import mongoose from 'mongoose';

// Cached running balance per member. Updated via $inc on every earn/redeem/expiry.
// LedgerEntry is the source of truth — this is a derived cache.
const walletSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    balance:  { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

walletSchema.index({ tenantId: 1, memberId: 1 }, { unique: true });
walletSchema.index({ tenantId: 1, balance: 1 });

walletSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const Wallet = mongoose.model('Wallet', walletSchema);

export default Wallet;
