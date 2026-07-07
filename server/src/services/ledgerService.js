import LedgerEntry from '../models/LedgerEntry.js';
import Wallet from '../models/Wallet.js';
import EarnRule from '../models/EarnRule.js';
import UserTier from '../models/UserTier.js';
import Tier from '../models/Tier.js';
import { ApiError } from '../utils/ApiError.js';
import {
  transactionType,
  transactionPointConclusion,
  transactionSource,
  statusAI,
} from '../config/constants.js';

// Both methods run inside the orderService transaction — they receive the
// session and never start their own.
class LedgerService {

  static earnPoints = async ({ tenantId, memberId, orderId, totalAmount, actorId }, session) => {
    const userTier = await UserTier.findOne({ tenantId, memberId }).session(session);

    const earnRule = await EarnRule.findOne({
      tenantId,
      status: statusAI.ACTIVE,
      $or: [{ tierId: userTier?.tierId ?? null }, { tierId: null }],
    }).sort({ tierId: -1 }).session(session); // tier-specific rule wins over catch-all
    if (!earnRule) return { pointsEarned: 0, ledgerEntry: null };

    let pointsMultiplier = 1;
    if (userTier) {
      const tier = await Tier.findOne({ _id: userTier.tierId, tenantId }).session(session);
      if (tier?.pointsMultiplier) pointsMultiplier = tier.pointsMultiplier;
    }

    const raw = Math.floor(totalAmount / earnRule.transactionUnit) * earnRule.pointsPerUnit;
    let pointsEarned = Math.floor(raw * pointsMultiplier);
    if (earnRule.maxPoints) pointsEarned = Math.min(pointsEarned, earnRule.maxPoints);
    if (pointsEarned <= 0) return { pointsEarned: 0, ledgerEntry: null };

    const pointExpiryDate = new Date();
    pointExpiryDate.setDate(pointExpiryDate.getDate() + earnRule.expiryDays);

    const [entry] = await LedgerEntry.create([{
      tenantId,
      memberId,
      type: transactionType.CREDIT,
      points: pointsEarned,
      remainingPoints: pointsEarned,
      pointExpiryDate,
      conclusion: transactionPointConclusion.ACTIVE,
      source: transactionSource.PURCHASE,
      orderId,
      earnRuleId: earnRule._id,
      pointsMultiplier,
      actorId,
    }], { session });

    await Wallet.updateOne(
      { tenantId, memberId },
      { $inc: { balance: pointsEarned } },
      { session }
    );

    return { pointsEarned, ledgerEntry: entry };
  };

  static redeemPoints = async ({ tenantId, memberId, pointsToRedeem, orderId, actorId }, session) => {
    const wallet = await Wallet.findOne({ tenantId, memberId }).session(session);
    if (!wallet || wallet.balance < pointsToRedeem) {
      throw new ApiError(400, 'Insufficient points balance');
    }

    // FIFO: burn ACTIVE credit lots, soonest expiry first
    const lots = await LedgerEntry.find({
      tenantId,
      memberId,
      type: transactionType.CREDIT,
      conclusion: transactionPointConclusion.ACTIVE,
      remainingPoints: { $gt: 0 },
    }).sort({ pointExpiryDate: 1 }).session(session);

    let remaining = pointsToRedeem;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const burn = Math.min(lot.remainingPoints, remaining);
      const newRemaining = lot.remainingPoints - burn;
      await LedgerEntry.updateOne(
        { _id: lot._id },
        {
          $inc: { remainingPoints: -burn },
          ...(newRemaining === 0 && {
            $set: { conclusion: transactionPointConclusion.REDEEMED },
          }),
        },
        { session }
      );
      remaining -= burn;
    }

    // DEBIT summary entry — points stored positive, type carries the sign
    await LedgerEntry.create([{
      tenantId,
      memberId,
      type: transactionType.DEBIT,
      points: pointsToRedeem,
      conclusion: transactionPointConclusion.REDEEMED,
      source: transactionSource.PURCHASE,
      orderId,
      actorId,
    }], { session });

    await Wallet.updateOne(
      { tenantId, memberId },
      { $inc: { balance: -pointsToRedeem } },
      { session }
    );

    return { pointsBurned: pointsToRedeem };
  };

}

export default LedgerService;
