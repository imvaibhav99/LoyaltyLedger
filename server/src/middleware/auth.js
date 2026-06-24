import { verifyAccessToken } from '../utils/token.js';
import { ApiError } from '../utils/ApiError.js';

export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(401, 'No token provided');
    }
    const token   = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    req.user = {
      userId:   payload.userId,
      tenantId: payload.tenantId,
      role:     payload.role,
    };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    if (err.name === 'TokenExpiredError') return next(new ApiError(401, 'Token expired'));
    next(new ApiError(401, 'Invalid token'));
  }
}
