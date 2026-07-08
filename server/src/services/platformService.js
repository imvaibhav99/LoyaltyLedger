import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import Member from '../models/Member.js';
import Order from '../models/Order.js';
import Wallet from '../models/Wallet.js';
import User from '../models/User.js';
import Store from '../models/Store.js';
import Tier from '../models/Tier.js';
import EarnRule from '../models/EarnRule.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';
import { USER_ROLES, statusAI } from '../config/constants.js';

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

// Platform admin only — these queries deliberately span all tenants.
class PlatformService {

  static listTenants = async ({ cursor, limit = 20 }) => {
    const query = cursor ? { _id: { $gt: cursor } } : {};
    const tenants = await Tenant.find(query).sort({ _id: 1 }).limit(Number(limit) + 1);
    const nextCursor = tenants.length > limit ? tenants.pop()._id : null;
    return { data: tenants, nextCursor };
  };

  static getTenant = async ({ tenantId }) => {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw new ApiError(404, 'Tenant not found');

    const [
      owner,
      staff,
      memberCount,
      orderCount,
      storeCount,
      tierCount,
      earnRuleCount,
      [liabilityAgg],
      lastOrder,
    ] = await Promise.all([
      User.findOne({ tenantId, role: USER_ROLES.MERCHANT_OWNER }),
      User.find({
        tenantId,
        role: { $in: [USER_ROLES.MERCHANT_MANAGER, USER_ROLES.MERCHANT_STAFF] },
      }).select('name email role status empId createdAt'),
      Member.countDocuments({ tenantId }),
      Order.countDocuments({ tenantId }),
      Store.countDocuments({ tenantId }),
      Tier.countDocuments({ tenantId }),
      EarnRule.countDocuments({ tenantId, status: statusAI.ACTIVE }),
      Wallet.aggregate([
        { $match: { tenantId: toObjectId(tenantId) } },
        { $group: { _id: null, total: { $sum: '$balance' } } },
      ]),
      Order.findOne({ tenantId }).sort({ createdAt: -1 }).select('createdAt totalAmount'),
    ]);

    return {
      tenant,
      owner,
      staff,
      stats: {
        memberCount,
        orderCount,
        storeCount,
        tierCount,
        earnRuleCount,
        staffCount: staff.length,
        pointsLiability: liabilityAgg?.total ?? 0,
        lastOrderAt: lastOrder?.createdAt ?? null,
        lastOrderAmount: lastOrder?.totalAmount ?? null,
      },
    };
  };

  static updateTenantStatus = async ({ tenantId, status, actorId }) => {
    const tenant = await Tenant.findByIdAndUpdate(tenantId, { status }, { new: true });
    if (!tenant) throw new ApiError(404, 'Tenant not found');

    // Platform-level action — tenantId stays null on the audit entry;
    // the affected tenant is recorded as the resource.
    await AuditLog.create({
      tenantId: null,
      actorId,
      action: 'TENANT_STATUS_UPDATED',
      resource: 'Tenant',
      resourceId: tenant._id,
      after: { status },
    });

    return { tenant };
  };

}

export default PlatformService;
