import Store from '../models/Store.js';
import AuditLog from '../models/AuditLog.js';
import { ApiError } from '../utils/ApiError.js';

class StoreService {

  static createStore = async ({ tenantId, actorId, ...fields }) => {
    if (fields.code) {
      const duplicate = await Store.findOne({ tenantId, code: fields.code });
      if (duplicate) throw new ApiError(409, 'A store with this code already exists');
    }

    const store = await Store.create({ tenantId, ...fields });

    await AuditLog.create({
      tenantId,
      actorId,
      action: 'STORE_CREATED',
      resource: 'Store',
      resourceId: store._id,
      after: { name: store.name, code: store.code },
    });

    return { store };
  };

  static listStores = async ({ tenantId, status, cursor, limit = 20 }) => {
    const query = { tenantId };
    if (status) query.status = status;
    if (cursor) query._id = { $gt: cursor };

    const stores = await Store.find(query).sort({ _id: 1 }).limit(Number(limit) + 1);
    const nextCursor = stores.length > limit ? stores.pop()._id : null;
    return { data: stores, nextCursor };
  };

  static getStore = async ({ tenantId, storeId }) => {
    const store = await Store.findOne({ _id: storeId, tenantId });
    if (!store) throw new ApiError(404, 'Store not found');
    return { store };
  };

  static updateStore = async ({ tenantId, storeId, actorId, updates }) => {
    const store = await Store.findOneAndUpdate(
      { _id: storeId, tenantId },
      updates,
      { new: true, runValidators: true }
    );
    if (!store) throw new ApiError(404, 'Store not found');

    await AuditLog.create({
      tenantId,
      actorId,
      action: 'STORE_UPDATED',
      resource: 'Store',
      resourceId: store._id,
      after: updates,
    });

    return { store };
  };

}

export default StoreService;
