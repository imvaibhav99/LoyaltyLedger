import IdempotencyKey from '../models/IdempotencyKey.js';
import { ApiError } from '../utils/ApiError.js';

// If the POS retries a request with the same Idempotency-Key,
// return the cached response instead of re-processing the order.
export async function idempotency(req, res, next) {
  try {
    const key = req.headers['idempotency-key'];
    if (!key) return next(new ApiError(400, 'Idempotency-Key header is required'));

    const existing = await IdempotencyKey.findOne({ tenantId: req.user.tenantId, key });
    if (existing) {
      return res.status(existing.statusCode).json(existing.response);
    }

    req.idempotencyKey = key;
    next();
  } catch (err) {
    next(err);
  }
}
