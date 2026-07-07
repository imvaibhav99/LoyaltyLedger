import mongoose from 'mongoose';
import Member from '../models/Member.js';
import Wallet from '../models/Wallet.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Order from '../models/Order.js';
import UserTier from '../models/UserTier.js';
import { transactionType } from '../config/constants.js';

// aggregate() does not cast strings to ObjectId — cast explicitly
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

class AnalyticsService {

  static getDashboard = async ({ tenantId }) => {
    const tenantOid = toObjectId(tenantId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalMembers,
      activeMembers,
      [liabilityAgg],
      [earnedAgg],
      [redeemedAgg],
      totalOrders30d,
      tierDist,
    ] = await Promise.all([
      Member.countDocuments({ tenantId }),
      Member.countDocuments({ tenantId, status: 'active' }),
      Wallet.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: null, total: { $sum: '$balance' } } },
      ]),
      LedgerEntry.aggregate([
        { $match: { tenantId: tenantOid, type: transactionType.CREDIT, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$points' } } },
      ]),
      LedgerEntry.aggregate([
        { $match: { tenantId: tenantOid, type: transactionType.DEBIT, createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$points' } } },
      ]),
      Order.countDocuments({ tenantId, createdAt: { $gte: thirtyDaysAgo } }),
      UserTier.aggregate([
        { $match: { tenantId: tenantOid } },
        { $group: { _id: '$tierId', count: { $sum: 1 } } },
        { $lookup: { from: 'tiers', localField: '_id', foreignField: '_id', as: 'tier' } },
        { $unwind: { path: '$tier', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, tierId: '$_id', tierName: '$tier.name', count: 1 } },
      ]),
    ]);

    return {
      totalMembers,
      activeMembers,
      pointsLiability:   liabilityAgg?.total ?? 0,
      pointsEarned30d:   earnedAgg?.total ?? 0,
      pointsRedeemed30d: redeemedAgg?.total ?? 0,
      totalOrders30d,
      tierDistribution:  tierDist,
    };
  };

  static getMemberLedger = async ({ tenantId, memberId, cursor, limit = 20 }) => {
    const query = { tenantId, memberId };
    if (cursor) query._id = { $lt: cursor };

    const entries = await LedgerEntry.find(query).sort({ _id: -1 }).limit(Number(limit) + 1);
    const nextCursor = entries.length > limit ? entries.pop()._id : null;
    return { data: entries, nextCursor };
  };

}

export default AnalyticsService;
