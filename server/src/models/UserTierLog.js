import mongoose from 'mongoose';
import { tierAction } from '../config/constants.js';

// Immutable history of every tier change. Append-only, never updated.
const userTierLogSchema = new mongoose.Schema(
  {
    tenantId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    oldTierId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tier' },
    newTierId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Tier',   required: true },
    action:           { type: String, enum: Object.values(tierAction), required: true },
    points:           { type: Number, default: 0 }, // bonus points credited on upgrade
    triggeredByOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    // null when triggered by downgrade cron
  },
  { timestamps: true }
);

userTierLogSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });

userTierLogSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const UserTierLog = mongoose.model('UserTierLog', userTierLogSchema);

export default UserTierLog;
