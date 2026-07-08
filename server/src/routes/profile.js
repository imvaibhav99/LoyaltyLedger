import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import {
  updateAccountSchema,
  changePasswordSchema,
  updateBusinessSchema,
} from '../validators/profileValidator.js';
import ProfileController from '../controllers/profileController.js';
import { USER_ROLES } from '../config/constants.js';

const router = Router();
router.use(authenticate);

router.get('/',          ProfileController.getProfile);
router.put('/',          validate(updateAccountSchema),  ProfileController.updateAccount);
router.put('/password',  validate(changePasswordSchema), ProfileController.changePassword);
router.put('/business',
  requireRole(USER_ROLES.MERCHANT_OWNER),
  validate(updateBusinessSchema),
  ProfileController.updateBusiness
);

export default router;
