import mongoose from 'mongoose';
import { tierDurationType, tierAssociateRule, statusAIP } from '../config/constants.js';

// Tiers chain together: Bronze → Silver → Gold via upgradePolicyTierId.
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
    upgradePoints:    { type: Number, min: 0, default: 0 },
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

const Tier = mongoose.model('Tier', tierSchema);

export default Tier;
