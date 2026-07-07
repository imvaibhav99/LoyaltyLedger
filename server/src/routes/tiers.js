import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createTierSchema, updateTierSchema } from '../validators/tierValidator.js';
import TierController from '../controllers/tierController.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();
router.use(authenticate);

router.get('/',
  requireRole(USER_ROLES.MERCHANT_OWNER, USER_ROLES.MERCHANT_MANAGER),
  TierController.listTiers
);
router.post('/',
  validate(createTierSchema),
  requireRole(USER_ROLES.MERCHANT_OWNER),
  TierController.createTier
);
router.put('/:id',
  validate(updateTierSchema),
  requireRole(USER_ROLES.MERCHANT_OWNER),
  TierController.updateTier
);

export default router;
