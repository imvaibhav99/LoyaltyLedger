import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:      { type: String, required: true, trim: true },
    phone:     { type: String, required: true, trim: true },
    email:     { type: String, lowercase: true, trim: true },
    memberId:  { type: String },
    // Auto-generated customer-facing ID: "MBR-A1B2C3D4"
    dob:       { type: Date },
    gender:    { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
    address:   { type: String },
    city:      { type: String },
    state:     { type: String },
    pinCode: {
      type: String,
      validate: { validator: v => !v || /^\d{6}$/.test(v), message: 'Invalid pin code' },
    },
    storeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    // Store where they enrolled
    status:         { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' },
    loyaltyStatus:  { type: String, enum: ['LOYAL', 'DORMANT', 'LAPSED'], default: 'LOYAL' },
    isProfileCompleted: { type: Boolean, default: false },
    referralCode:   { type: String },
    referredBy:     { type: String },
  },
  { timestamps: true }
);

memberSchema.index({ tenantId: 1, phone: 1 }, { unique: true });
memberSchema.index({ tenantId: 1, memberId: 1 }, { unique: true, sparse: true });
memberSchema.index({ tenantId: 1, status: 1 });

memberSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const Member = mongoose.model('Member', memberSchema);

export default Member;
