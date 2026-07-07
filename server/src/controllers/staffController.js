import { asyncHandler } from '../utils/asyncHandler.js';
import StaffService from '../services/staffService.js';

class StaffController {

  static createStaff = asyncHandler(async (req, res) => {
    const data = await StaffService.createStaff({
      tenantId: req.user.tenantId,
      actorId:  req.user.userId,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  });

  static listStaff = asyncHandler(async (req, res) => {
    const data = await StaffService.listStaff({ tenantId: req.user.tenantId });
    res.json({ success: true, data });
  });

  static deactivateStaff = asyncHandler(async (req, res) => {
    const data = await StaffService.deactivateStaff({
      tenantId: req.user.tenantId,
      userId:   req.params.id,
      actorId:  req.user.userId,
    });
    res.json({ success: true, data });
  });

}

export default StaffController;
