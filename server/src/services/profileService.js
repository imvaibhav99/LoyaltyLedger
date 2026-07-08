import mongoose from 'mongoose';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import RefreshToken from '../models/RefreshToken.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';

class ProfileService {

  static getProfile = async ({ userId }) => {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    const tenant = user.tenantId ? await Tenant.findById(user.tenantId) : null;
    return { user, tenant };
  };

  static updateAccount = async ({ userId, name, email }) => {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    if (email && email.toLowerCase() !== user.email) {
      const duplicate = await User.findOne({
        tenantId: user.tenantId,
        email: email.toLowerCase(),
        _id: { $ne: userId },
      });
      if (duplicate) throw new ApiError(409, 'This email is already in use');
      user.email = email.toLowerCase();
    }
    if (name) user.name = name;

    await user.save();
    return { user };
  };

  static changePassword = async ({ userId, currentPassword, newPassword }) => {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) throw new ApiError(404, 'User not found');

    const valid = await user.verifyPassword(currentPassword);
    if (!valid) throw new ApiError(401, 'Current password is incorrect');

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await user.setPassword(newPassword);
        await user.save({ session });
        // revoke every session — all devices must log in with the new password
        await RefreshToken.deleteMany({ userId }, { session });
      });
    } finally {
      await session.endSession();
    }
  };

  static updateBusiness = async ({ tenantId, actorId, businessName, billingEmail }) => {
    const updates = {};
    if (businessName) updates.businessName = businessName;
    if (billingEmail) updates.billingEmail = billingEmail.toLowerCase();
    if (!Object.keys(updates).length) throw new ApiError(400, 'Nothing to update');

    const session = await mongoose.startSession();
    try {
      let tenant;
      await session.withTransaction(async () => {
        tenant = await Tenant.findByIdAndUpdate(tenantId, updates, {
          new: true,
          runValidators: true,
          session,
        });
        if (!tenant) throw new ApiError(404, 'Tenant not found');

        await AuditLog.create([{
          tenantId,
          actorId,
          action: 'BUSINESS_UPDATED',
          resource: 'Tenant',
          resourceId: tenant._id,
          after: updates,
        }], { session });
      });
      return { tenant };
    } finally {
      await session.endSession();
    }
  };

}

export default ProfileService;
