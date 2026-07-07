import mongoose from 'mongoose';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';
import { generateId } from '../utils/generateId.js';
import { USER_ROLES } from '../config/constants.js';

class StaffService {

  static createStaff = async ({ tenantId, actorId, name, email, password, role, roleId }) => {
    if (roleId) {
      const roleDoc = await Role.findOne({ _id: roleId, tenantId });
      if (!roleDoc) throw new ApiError(404, 'Role not found');
    }

    const existing = await User.findOne({ tenantId, email: email.toLowerCase() });
    if (existing) throw new ApiError(409, 'A user with this email already exists');

    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const user = new User({
          tenantId,
          name,
          email: email.toLowerCase(),
          role,
          roleId: roleId ?? null,
          empId: generateId('EMP'),
          passwordHash: 'placeholder',
        });
        await user.setPassword(password);
        await user.save({ session });

        await AuditLog.create([{
          tenantId,
          actorId,
          action: 'STAFF_CREATED',
          resource: 'User',
          resourceId: user._id,
          after: { name, email: user.email, role },
        }], { session });

        result = { user };
      });
      return result;
    } finally {
      await session.endSession();
    }
  };

  static listStaff = async ({ tenantId }) => {
    const staff = await User.find({
      tenantId,
      role: { $in: [USER_ROLES.MERCHANT_MANAGER, USER_ROLES.MERCHANT_STAFF] },
    }).populate('roleId');
    return { data: staff };
  };

  static deactivateStaff = async ({ tenantId, userId, actorId }) => {
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        tenantId,
        role: { $in: [USER_ROLES.MERCHANT_MANAGER, USER_ROLES.MERCHANT_STAFF] },
      },
      { status: 'inactive' },
      { new: true }
    );
    if (!user) throw new ApiError(404, 'Staff member not found');

    await AuditLog.create({
      tenantId,
      actorId,
      action: 'STAFF_DEACTIVATED',
      resource: 'User',
      resourceId: user._id,
      after: { status: 'inactive' },
    });

    return { user };
  };

}

export default StaffService;
