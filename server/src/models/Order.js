import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    skuCode:  { type: String },
    skuName:  { type: String },
    quantity: { type: Number, min: 1, required: true },
    rate:     { type: Number, min: 0, required: true },
    amount:   { type: Number, min: 0, required: true },
    status:   {
      type: String,
      enum: ['COMPLETED', 'RETURNED', 'PARTIAL_RETURNED'],
      default: 'COMPLETED',
    },
  },
  { _id: false }
);

// A POS purchase. Creating an order triggers the earn + optional redeem flow.
const orderSchema = new mongoose.Schema(
  {
    tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    storeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    actorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // The staff member who created this order at POS

    billId:      { type: String, required: true },
    items:       [itemSchema],

    totalAmount:  { type: Number, required: true, min: 0 },
    offerDiscount:{ type: Number, default: 0, min: 0 },
    // Points burned = offerDiscount value in currency (1 point = ₹1 by default, configurable)
    finalAmount:  { type: Number, min: 0 },

    walletUsed:   { type: Boolean, default: false },
    pointsEarned: { type: Number, default: 0, min: 0 },
    pointsBurned: { type: Number, default: 0, min: 0 },
    // Denormalized for display in order history. Source of truth is LedgerEntry.

    status: {
      type: String,
      enum: ['COMPLETED', 'FULLY_RETURNED', 'PARTIAL_RETURNED'],
      default: 'COMPLETED',
    },
    orderDate: { type: Date, default: Date.now },

    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, memberId: 1, orderDate: -1 });
orderSchema.index({ tenantId: 1, billId: 1 });
orderSchema.index({ tenantId: 1, orderDate: -1 });

orderSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => { ret.id = ret._id; delete ret._id; delete ret.__v; return ret; },
});

const Order = mongoose.model('Order', orderSchema);

export default Order;
