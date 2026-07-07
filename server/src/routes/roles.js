import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createRoleSchema, updateRoleSchema } from '../validators/staffValidator.js';
import RoleController from '../controllers/roleController.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();
router.use(authenticate, requireRole(USER_ROLES.MERCHANT_OWNER));

router.get('/',     RoleController.listRoles);
router.post('/',    validate(createRoleSchema), RoleController.createRole);
router.put('/:id',  validate(updateRoleSchema), RoleController.updateRole);

export default router;
