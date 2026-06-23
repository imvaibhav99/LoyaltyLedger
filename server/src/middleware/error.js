import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export function errorMiddleware(err, req, res, _next) {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const message    = err instanceof ApiError ? err.message    : 'Internal server error';

  if (statusCode === 500) {
    console.error(`[ERROR] ${req.method} ${req.url}`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(err.details && { details: err.details }),
    ...(env.NODE_ENV === 'development' && statusCode === 500 && { stack: err.stack }),
  });
}
