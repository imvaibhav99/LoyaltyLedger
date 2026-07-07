import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { updateTenantStatusSchema } from '../validators/platformValidator.js';
import PlatformController from '../controllers/platformController.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();
router.use(authenticate, requireRole(USER_ROLES.PLATFORM_ADMIN));

router.get('/tenants',              PlatformController.listTenants);
router.get('/tenants/:id',          PlatformController.getTenant);
router.patch('/tenants/:id/status', validate(updateTenantStatusSchema), PlatformController.updateTenantStatus);

export default router;
