import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createStaffSchema } from '../validators/staffValidator.js';
import StaffController from '../controllers/staffController.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();
router.use(authenticate, requireRole(USER_ROLES.MERCHANT_OWNER));

router.get('/',        StaffController.listStaff);
router.post('/',       validate(createStaffSchema), StaffController.createStaff);
router.delete('/:id',  StaffController.deactivateStaff);

export default router;
