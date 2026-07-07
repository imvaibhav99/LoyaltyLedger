import { asyncHandler } from '../utils/asyncHandler.js';
import MemberService from '../services/memberService.js';

class MemberController {

  static createMember = asyncHandler(async (req, res) => {
    const data = await MemberService.createMember({
      tenantId: req.user.tenantId,
      actorId:  req.user.userId,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  });

  static listMembers = asyncHandler(async (req, res) => {
    const { search, status, cursor, limit } = req.query;
    const data = await MemberService.listMembers({
      tenantId: req.user.tenantId,
      search,
      status,
      cursor,
      ...(limit && { limit: Number(limit) }),
    });
    res.json({ success: true, data });
  });

  static getMember = asyncHandler(async (req, res) => {
    const data = await MemberService.getMember({
      tenantId: req.user.tenantId,
      memberId: req.params.id,
    });
    res.json({ success: true, data });
  });

  static updateMember = asyncHandler(async (req, res) => {
    const data = await MemberService.updateMember({
      tenantId: req.user.tenantId,
      memberId: req.params.id,
      actorId:  req.user.userId,
      updates:  req.body,
    });
    res.json({ success: true, data });
  });

}

export default MemberController;
