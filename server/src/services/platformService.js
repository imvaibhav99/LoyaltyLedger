import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import Member from '../models/Member.js';
import Order from '../models/Order.js';
import Wallet from '../models/Wallet.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';

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

    const [memberCount, orderCount, [liabilityAgg]] = await Promise.all([
      Member.countDocuments({ tenantId }),
      Order.countDocuments({ tenantId }),
      Wallet.aggregate([
        { $match: { tenantId: toObjectId(tenantId) } },
        { $group: { _id: null, total: { $sum: '$balance' } } },
      ]),
    ]);

    return {
      tenant,
      stats: {
        memberCount,
        orderCount,
        pointsLiability: liabilityAgg?.total ?? 0,
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
