import mongoose from 'mongoose';

// One document per member — tracks their current tier and when their tier window expires.
// Updated in-place on upgrade or downgrade.
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
userTierSchema.index({ tenantId: 1, tierExpiryDate: 1 });

userTierSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const UserTier = mongoose.model('UserTier', userTierSchema);

export default UserTier;
