import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import AnalyticsController from '../controllers/analyticsController.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();
router.use(authenticate);

router.get('/dashboard',
  requireRole(USER_ROLES.MERCHANT_OWNER, USER_ROLES.MERCHANT_MANAGER),
  AnalyticsController.getDashboard
);
router.get('/ledger/:memberId', AnalyticsController.getMemberLedger);

export default router;
