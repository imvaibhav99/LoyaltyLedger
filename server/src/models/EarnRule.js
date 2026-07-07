import mongoose from 'mongoose';
import { statusAI } from '../config/constants.js';

// Defines how members earn points. A rule can be tier-specific (tierId set)
// or universal (tierId: null). The earn service picks the most specific match.
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
  },
  { timestamps: true }
);

earnRuleSchema.index({ tenantId: 1, status: 1 });
earnRuleSchema.index({ tenantId: 1, tierId: 1, status: 1 });

earnRuleSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const EarnRule = mongoose.model('EarnRule', earnRuleSchema);

export default EarnRule;
