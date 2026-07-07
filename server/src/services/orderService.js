import mongoose from 'mongoose';
import Member from '../models/Member.js';
import Order from '../models/Order.js';
import IdempotencyKey from '../models/IdempotencyKey.js';
import AuditLog from '../models/AuditLog.js';
import LedgerService from './ledgerService.js';
import TierService from './tierService.js';
import { ApiError } from '../utils/ApiError.js';

class OrderService {

  static createOrder = async ({
    tenantId, actorId, idempotencyKey,
    memberId, billId, items, totalAmount,
    storeId, walletUsed, pointsToRedeem, offerDiscount,
  }) => {
    const member = await Member.findOne({ _id: memberId, tenantId });
    if (!member) throw new ApiError(404, 'Member not found');
    if (member.status !== 'active') throw new ApiError(400, 'Member is not active');

    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        // Order is created first so both ledger entries can reference its _id.
        // pointsEarned/pointsBurned are patched in one update at the end.
        const [order] = await Order.create([{
          tenantId, memberId, billId, items, totalAmount,
          storeId, actorId, offerDiscount, walletUsed,
          idempotencyKey,
        }], { session });

        let pointsBurned = 0;
        if (walletUsed && pointsToRedeem > 0) {
          ({ pointsBurned } = await LedgerService.redeemPoints(
            { tenantId, memberId, pointsToRedeem, orderId: order._id, actorId },
            session
          ));
        }

        const { pointsEarned } = await LedgerService.earnPoints(
          { tenantId, memberId, orderId: order._id, totalAmount, actorId },
          session
        );

        await Order.updateOne(
          { _id: order._id },
          { pointsEarned, pointsBurned },
          { session }
        );

        await TierService.checkAndUpgradeTier({ tenantId, memberId }, session);

        const response = {
          success: true,
          data: { orderId: order._id, billId, pointsEarned, pointsBurned, totalAmount },
        };

        await IdempotencyKey.create([{
          tenantId,
          key: idempotencyKey,
          statusCode: 201,
          response,
        }], { session });

        await AuditLog.create([{
          tenantId,
          actorId,
          action: 'ORDER_CREATED',
          resource: 'Order',
          resourceId: order._id,
          after: { billId, pointsEarned, pointsBurned, totalAmount },
        }], { session });

        result = response;
      });
      return result;
    } finally {
      await session.endSession();
    }
  };

  static listOrders = async ({ tenantId, memberId, cursor, limit = 20 }) => {
    const query = { tenantId };
    if (memberId) query.memberId = memberId;
    if (cursor) query._id = { $lt: cursor };

    const orders = await Order.find(query).sort({ _id: -1 }).limit(Number(limit) + 1);
    const nextCursor = orders.length > limit ? orders.pop()._id : null;
    return { data: orders, nextCursor };
  };

  static getOrder = async ({ tenantId, orderId }) => {
    const order = await Order.findOne({ _id: orderId, tenantId });
    if (!order) throw new ApiError(404, 'Order not found');
    return { order };
  };

}

export default OrderService;
