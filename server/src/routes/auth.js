import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, signupSchema, refreshSchema } from '../validators/authValidator.js';

const router = Router();

router.post('/login',       validate(loginSchema),   authController.login);
router.post('/signup',      validate(signupSchema),  authController.signup);
router.post('/refresh',     validate(refreshSchema), authController.refresh);
router.post('/logout',      validate(refreshSchema), authController.logout);
router.post('/logout-all',  authenticate,            authController.logoutAll);
router.get('/me',           authenticate,            authController.me);

export default router;
