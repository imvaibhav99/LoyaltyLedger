import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { idempotency } from '../middleware/idempotency.js';
import { createOrderSchema } from '../validators/orderValidator.js';
import OrderController from '../controllers/orderController.js';

const router = Router();
router.use(authenticate);

router.post('/',
  validate(createOrderSchema),
  requirePermission('transactions', 'write'),
  idempotency,
  OrderController.createOrder
);
router.get('/',    requirePermission('transactions', 'read'), OrderController.listOrders);
router.get('/:id', requirePermission('transactions', 'read'), OrderController.getOrder);

export default router;
