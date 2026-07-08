import { asyncHandler } from '../utils/asyncHandler.js';
import ProfileService from '../services/profileService.js';

class ProfileController {

  static getProfile = asyncHandler(async (req, res) => {
    const data = await ProfileService.getProfile({ userId: req.user.userId });
    res.json({ success: true, data });
  });

  static updateAccount = asyncHandler(async (req, res) => {
    const data = await ProfileService.updateAccount({
      userId: req.user.userId,
      ...req.body,
    });
    res.json({ success: true, data });
  });

  static changePassword = asyncHandler(async (req, res) => {
    await ProfileService.changePassword({
      userId: req.user.userId,
      ...req.body,
    });
    res.json({ success: true, message: 'Password changed — please log in again on all devices' });
  });

  static updateBusiness = asyncHandler(async (req, res) => {
    const data = await ProfileService.updateBusiness({
      tenantId: req.user.tenantId,
      actorId:  req.user.userId,
      ...req.body,
    });
    res.json({ success: true, data });
  });

}

export default ProfileController;
