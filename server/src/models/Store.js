import mongoose from 'mongoose';
import { statusAI } from '../config/constants.js';

// Physical or online locations within a tenant. Members enroll at a store.
const storeSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name:     { type: String, required: true, trim: true },
    code:     { type: String, trim: true },
    address:  { type: String, trim: true },
    city:     { type: String, trim: true },
    state:    { type: String, trim: true },
    pinCode:  { type: String, trim: true },
    type: {
      type: String,
      enum: ['FLAGSHIP', 'OUTLET', 'FRANCHISE', 'ONLINE'],
      default: 'OUTLET',
    },
    status: { type: String, enum: Object.values(statusAI), default: statusAI.ACTIVE },
  },
  { timestamps: true }
);

storeSchema.index({ tenantId: 1, status: 1 });
storeSchema.index({ tenantId: 1, code: 1 }, { unique: true, sparse: true });

storeSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const Store = mongoose.model('Store', storeSchema);

export default Store;
