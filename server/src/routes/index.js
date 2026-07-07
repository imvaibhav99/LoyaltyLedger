import { Router } from 'express';
import authRouter from './auth.js';
import membersRouter from './members.js';
import storesRouter from './stores.js';
import tiersRouter from './tiers.js';
import earnRulesRouter from './earnRules.js';
import ordersRouter from './orders.js';
import staffRouter from './staff.js';
import rolesRouter from './roles.js';
import analyticsRouter from './analytics.js';
import platformRouter from './platform.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/members', membersRouter);
router.use('/stores', storesRouter);
router.use('/tiers', tiersRouter);
router.use('/earn-rules', earnRulesRouter);
router.use('/orders', ordersRouter);
router.use('/staff', staffRouter);
router.use('/roles', rolesRouter);
router.use('/analytics', analyticsRouter);
router.use('/platform', platformRouter);

export default router;
