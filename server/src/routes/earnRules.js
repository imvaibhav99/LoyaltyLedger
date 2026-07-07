import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createEarnRuleSchema, updateEarnRuleSchema } from '../validators/earnRuleValidator.js';
import EarnRuleController from '../controllers/earnRuleController.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();
router.use(authenticate);

router.get('/',
  requireRole(USER_ROLES.MERCHANT_OWNER, USER_ROLES.MERCHANT_MANAGER),
  EarnRuleController.listEarnRules
);
router.post('/',
  validate(createEarnRuleSchema),
  requireRole(USER_ROLES.MERCHANT_OWNER),
  EarnRuleController.createEarnRule
);
router.put('/:id',
  validate(updateEarnRuleSchema),
  requireRole(USER_ROLES.MERCHANT_OWNER),
  EarnRuleController.updateEarnRule
);
router.delete('/:id',
  requireRole(USER_ROLES.MERCHANT_OWNER),
  EarnRuleController.deleteEarnRule
);

export default router;
