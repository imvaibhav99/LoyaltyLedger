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

// Granular permission sets for MERCHANT_MANAGER and MERCHANT_STAFF.
// MERCHANT_OWNER → full access by role (no roleId needed).
// PLATFORM_ADMIN → bypasses all permission checks.
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

const Role = mongoose.model('Role', roleSchema);

export default Role;
