import { asyncHandler } from '../utils/asyncHandler.js';
import OrderService from '../services/orderService.js';

class OrderController {

  static createOrder = asyncHandler(async (req, res) => {
    const result = await OrderService.createOrder({
      tenantId:       req.user.tenantId,
      actorId:        req.user.userId,
      idempotencyKey: req.idempotencyKey,
      ...req.body,
    });
    res.status(201).json(result);
  });

  static listOrders = asyncHandler(async (req, res) => {
    const { memberId, cursor, limit } = req.query;
    const data = await OrderService.listOrders({
      tenantId: req.user.tenantId,
      memberId,
      cursor,
      ...(limit && { limit: Number(limit) }),
    });
    res.json({ success: true, data });
  });

  static getOrder = asyncHandler(async (req, res) => {
    const data = await OrderService.getOrder({
      tenantId: req.user.tenantId,
      orderId:  req.params.id,
    });
    res.json({ success: true, data });
  });

}

export default OrderController;
