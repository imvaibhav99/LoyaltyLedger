import { ApiError } from '../utils/ApiError.js';
import User from '../models/User.js';
import { USER_ROLES } from '../config/constants.js';

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    next();
  };
}

// PLATFORM_ADMIN and MERCHANT_OWNER always pass — only MANAGER/STAFF hit the Role.access[] check
export function requirePermission(module, action) {
  return async (req, _res, next) => {
    try {
      if (!req.user) return next(new ApiError(401, 'Authentication required'));
      const { role, userId } = req.user;
      if (role === USER_ROLES.PLATFORM_ADMIN || role === USER_ROLES.MERCHANT_OWNER) return next();
      const user = await User.findById(userId).populate('roleId');
      if (!user?.roleId) return next(new ApiError(403, 'No role assigned'));
      const perm = user.roleId.access.find((a) => a.module === module);
      if (!perm || !perm[action]) return next(new ApiError(403, 'Permission denied'));
      next();
    } catch (err) {
      next(err);
    }
  };
}
