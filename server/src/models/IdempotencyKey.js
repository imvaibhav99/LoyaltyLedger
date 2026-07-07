import mongoose from 'mongoose';

// Prevents double-processing when POS retries a request.
// Written inside the same MongoDB transaction as the earn/redeem effect.
const idempotencyKeySchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  key:        { type: String, required: true },
  statusCode: { type: Number },
  response:   { type: mongoose.Schema.Types.Mixed },
  createdAt:  { type: Date, default: Date.now, expires: 86400 }, // TTL 24h
});

idempotencyKeySchema.index({ tenantId: 1, key: 1 }, { unique: true });

const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);

export default IdempotencyKey;
