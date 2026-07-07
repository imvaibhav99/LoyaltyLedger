import { asyncHandler } from '../utils/asyncHandler.js';
import StoreService from '../services/storeService.js';

class StoreController {

  static createStore = asyncHandler(async (req, res) => {
    const data = await StoreService.createStore({
      tenantId: req.user.tenantId,
      actorId:  req.user.userId,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  });

  static listStores = asyncHandler(async (req, res) => {
    const { status, cursor, limit } = req.query;
    const data = await StoreService.listStores({
      tenantId: req.user.tenantId,
      status,
      cursor,
      ...(limit && { limit: Number(limit) }),
    });
    res.json({ success: true, data });
  });

  static getStore = asyncHandler(async (req, res) => {
    const data = await StoreService.getStore({
      tenantId: req.user.tenantId,
      storeId:  req.params.id,
    });
    res.json({ success: true, data });
  });

  static updateStore = asyncHandler(async (req, res) => {
    const data = await StoreService.updateStore({
      tenantId: req.user.tenantId,
      storeId:  req.params.id,
      actorId:  req.user.userId,
      updates:  req.body,
    });
    res.json({ success: true, data });
  });

}

export default StoreController;
