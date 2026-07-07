import mongoose from 'mongoose';
import UserTier from '../models/UserTier.js';
import Tier from '../models/Tier.js';
import Order from '../models/Order.js';
import LedgerEntry from '../models/LedgerEntry.js';
import UserTierLog from '../models/UserTierLog.js';
import { calculateExpiry } from '../utils/calculateExpiry.js';
import { transactionType, tierAssociateRule, tierAction } from '../config/constants.js';

// Nightly system-wide job — checks every member whose tier window has ended.
// If they failed the retain thresholds, they fall to the downgradePolicyTierId tier.
export async function downgradeTiers() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const expiredUserTiers = await UserTier.find({
    tierExpiryDate: { $lte: today },
  }).lean();

  let count = 0;
  for (const userTier of expiredUserTiers) {
    try {
      const tier = await Tier.findById(userTier.tierId);
      if (!tier?.downgradePolicyTierId) continue;

      const matchBase = {
        tenantId:  userTier.tenantId,
        memberId:  userTier.memberId,
        createdAt: { $gte: userTier.updatedAt, $lte: userTier.tierExpiryDate },
      };

      const [orderStats] = await Order.aggregate([
        { $match: matchBase },
        { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]);
      const [pointStats] = await LedgerEntry.aggregate([
        { $match: { ...matchBase, type: transactionType.CREDIT } },
        { $group: { _id: null, totalPoints: { $sum: '$points' } } },
      ]);

      const failedSpends = (orderStats?.totalAmount ?? 0) < tier.retainSpends;
      const failedVisits = (orderStats?.count ?? 0) < tier.retainVisits;
      const failedPoints = (pointStats?.totalPoints ?? 0) < tier.retainPoints;

      const shouldDowngrade = tier.retainRule === tierAssociateRule.AND
        ? failedSpends && failedVisits && failedPoints
        : failedSpends || failedVisits || failedPoints;
      if (!shouldDowngrade) continue;

      const downTier = await Tier.findById(tier.downgradePolicyTierId);
      const payload = { tierId: tier.downgradePolicyTierId, tierExpiryDate: null };
      if (downTier?.durationType && downTier?.duration && !downTier.isDefault) {
        payload.tierExpiryDate = calculateExpiry(downTier.durationType, downTier.duration);
      }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await UserTier.updateOne({ _id: userTier._id }, payload, { session });
          await UserTierLog.create([{
            tenantId:  userTier.tenantId,
            memberId:  userTier.memberId,
            oldTierId: userTier.tierId,
            newTierId: tier.downgradePolicyTierId,
            action:    tierAction.DOWNGRADE,
          }], { session });
        });
        count++;
      } finally {
        await session.endSession();
      }
    } catch (err) {
      console.error(`[tierDowngrade] failed for userTier ${userTier._id}:`, err.message);
    }
  }
  console.log(`[tierDowngrade] ${count} users downgraded`);
}
