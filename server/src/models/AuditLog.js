import mongoose from 'mongoose';

// Immutable append-only trail for all sensitive actions. Never updated.
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

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
