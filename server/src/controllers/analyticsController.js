import { asyncHandler } from '../utils/asyncHandler.js';
import AnalyticsService from '../services/analyticsService.js';

class AnalyticsController {

  static getDashboard = asyncHandler(async (req, res) => {
    const data = await AnalyticsService.getDashboard({ tenantId: req.user.tenantId });
    res.json({ success: true, data });
  });

  static getMemberLedger = asyncHandler(async (req, res) => {
    const { cursor, limit } = req.query;
    const data = await AnalyticsService.getMemberLedger({
      tenantId: req.user.tenantId,
      memberId: req.params.memberId,
      cursor,
      ...(limit && { limit: Number(limit) }),
    });
    res.json({ success: true, data });
  });

}

export default AnalyticsController;
