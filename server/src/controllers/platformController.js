import { asyncHandler } from '../utils/asyncHandler.js';
import PlatformService from '../services/platformService.js';

class PlatformController {

  static listTenants = asyncHandler(async (req, res) => {
    const { cursor, limit } = req.query;
    const data = await PlatformService.listTenants({
      cursor,
      ...(limit && { limit: Number(limit) }),
    });
    res.json({ success: true, data });
  });

  static getTenant = asyncHandler(async (req, res) => {
    const data = await PlatformService.getTenant({ tenantId: req.params.id });
    res.json({ success: true, data });
  });

  static updateTenantStatus = asyncHandler(async (req, res) => {
    const data = await PlatformService.updateTenantStatus({
      tenantId: req.params.id,
      status:   req.body.status,
      actorId:  req.user.userId,
    });
    res.json({ success: true, data });
  });

}

export default PlatformController;
