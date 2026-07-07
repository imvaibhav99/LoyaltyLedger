import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createMemberSchema, updateMemberSchema } from '../validators/memberValidator.js';
import MemberController from '../controllers/memberController.js';

const router = Router();
router.use(authenticate);

router.get('/',    requirePermission('members', 'read'),  MemberController.listMembers);
router.post('/',   validate(createMemberSchema), requirePermission('members', 'write'), MemberController.createMember);
router.get('/:id', requirePermission('members', 'read'),  MemberController.getMember);
router.put('/:id', validate(updateMemberSchema), requirePermission('members', 'write'), MemberController.updateMember);

export default router;
