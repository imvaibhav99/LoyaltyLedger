import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createStoreSchema, updateStoreSchema } from '../validators/storeValidator.js';
import StoreController from '../controllers/storeController.js';

const router = Router();
router.use(authenticate);

router.get('/',    requirePermission('stores', 'read'),  StoreController.listStores);
router.post('/',   validate(createStoreSchema), requirePermission('stores', 'write'), StoreController.createStore);
router.get('/:id', requirePermission('stores', 'read'),  StoreController.getStore);
router.put('/:id', validate(updateStoreSchema), requirePermission('stores', 'write'), StoreController.updateStore);

export default router;
