import { Router } from 'express';
import AuthController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, signupSchema, refreshSchema } from '../validators/authValidator.js';

const router = Router();

router.post('/login',       validate(loginSchema),   AuthController.login);
router.post('/signup',      validate(signupSchema),  AuthController.signup);
router.post('/refresh',     validate(refreshSchema), AuthController.refresh);
router.post('/logout',      validate(refreshSchema), AuthController.logout);
router.post('/logout-all',  authenticate,            AuthController.logoutAll);
router.get('/me',           authenticate,            AuthController.me);

export default router;
