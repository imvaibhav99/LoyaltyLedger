import mongoose from 'mongoose';
import Tier from '../models/Tier.js';
import UserTier from '../models/UserTier.js';
import UserTierLog from '../models/UserTierLog.js';
import Order from '../models/Order.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { ApiError } from '../utils/ApiError.js';
import { calculateExpiry } from '../utils/calculateExpiry.js';
import { statusAIP, tierAssociateRule, tierAction, transactionType } from '../config/constants.js';

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

class TierService {

  static createTier = async ({ tenantId, ...tierData }) => {
    if (tierData.isDefault) {
      await Tier.updateMany({ tenantId, isDefault: true }, { isDefault: false });
    }
    const tier = await Tier.create({ tenantId, status: statusAIP.ACTIVE, ...tierData });
    return { tier };
  };

  static listTiers = async ({ tenantId }) => {
    const tiers = await Tier.find({ tenantId, status: statusAIP.ACTIVE }).sort({ pointsMultiplier: 1 });
    return { data: tiers };
  };

  static updateTier = async ({ tenantId, tierId, updates }) => {
    if (updates.isDefault) {
      await Tier.updateMany({ tenantId, isDefault: true }, { isDefault: false });
    }
    const tier = await Tier.findOneAndUpdate(
      { _id: tierId, tenantId },
      updates,
      { new: true, runValidators: true }
    );
    if (!tier) throw new ApiError(404, 'Tier not found');
    return { tier };
  };

  // Called inside the orderService transaction after every order.
  // Recurses to handle multi-step upgrades (Bronze → Silver → Gold in one txn).
  static checkAndUpgradeTier = async ({ tenantId, memberId }, session) => {
    const userTier = await UserTier.findOne({ tenantId, memberId }).session(session);
    if (!userTier) return;

    const tier = await Tier.findOne({ _id: userTier.tierId, tenantId }).session(session);
    if (!tier?.upgradePolicyTierId) return;

    // Stats are counted within the current tier window (since last tier change)
    // aggregate() does not cast strings to ObjectId — cast explicitly
    const matchBase = {
      tenantId:  toObjectId(tenantId),
      memberId:  toObjectId(memberId),
      createdAt: { $gte: userTier.updatedAt },
    };

    const [[stats], [pointStats]] = await Promise.all([
      Order.aggregate([
        { $match: matchBase },
        { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]).session(session),
      LedgerEntry.aggregate([
        { $match: { ...matchBase, type: transactionType.CREDIT } },
        { $group: { _id: null, totalPoints: { $sum: '$points' } } },
      ]).session(session),
    ]);

    const spendEligible  = (stats?.totalAmount ?? 0) >= tier.upgradeSpends;
    const visitEligible  = (stats?.count ?? 0) >= tier.upgradeVisits;
    const pointsEligible = (pointStats?.totalPoints ?? 0) >= tier.upgradePoints;

    const isEligible = tier.upgradeRule === tierAssociateRule.AND
      ? spendEligible && visitEligible && pointsEligible
      : spendEligible || visitEligible || pointsEligible;
    if (!isEligible) return;

    const nextTier = await Tier.findOne({ _id: tier.upgradePolicyTierId, tenantId }).session(session);
    if (!nextTier) return;

    await UserTier.updateOne(
      { tenantId, memberId },
      { tierId: nextTier._id, tierExpiryDate: calculateExpiry(nextTier.durationType, nextTier.duration) },
      { session }
    );

    await UserTierLog.create(
      [{
        tenantId,
        memberId,
        oldTierId: tier._id,
        newTierId: nextTier._id,
        action: tierAction.UPGRADE,
      }],
      { session }
    );

    await TierService.checkAndUpgradeTier({ tenantId, memberId }, session);
  };

}

export default TierService;
