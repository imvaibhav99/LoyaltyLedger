import mongoose from 'mongoose';
import LedgerEntry from '../models/LedgerEntry.js';
import Wallet from '../models/Wallet.js';
import { transactionType, transactionPointConclusion } from '../config/constants.js';

// Nightly system-wide job — runs across all tenants; each lot carries its tenantId.
export async function expireUserPoints() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const expiredLots = await LedgerEntry.find({
    type: transactionType.CREDIT,
    conclusion: transactionPointConclusion.ACTIVE,
    pointExpiryDate: { $lte: today },
    remainingPoints: { $gt: 0 },
  }).lean();

  let count = 0;
  for (const lot of expiredLots) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Re-read atomically inside the txn — a redemption may have burned the lot
        // between the outer find and this transaction. Returns the pre-update doc.
        const fresh = await LedgerEntry.findOneAndUpdate(
          { _id: lot._id, conclusion: transactionPointConclusion.ACTIVE },
          { $set: { conclusion: transactionPointConclusion.EXPIRED, remainingPoints: 0 } },
          { session }
        );
        if (!fresh || fresh.remainingPoints <= 0) return;

        await Wallet.updateOne(
          { tenantId: lot.tenantId, memberId: lot.memberId },
          { $inc: { balance: -fresh.remainingPoints } },
          { session }
        );
        count++;
      });
    } catch (err) {
      console.error(`[pointExpiry] failed for lot ${lot._id}:`, err.message);
    } finally {
      await session.endSession();
    }
  }
  console.log(`[pointExpiry] ${count} lots expired`);
}
