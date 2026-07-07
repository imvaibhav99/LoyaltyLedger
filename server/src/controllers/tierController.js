import { asyncHandler } from '../utils/asyncHandler.js';
import TierService from '../services/tierService.js';

class TierController {

  static createTier = asyncHandler(async (req, res) => {
    const data = await TierService.createTier({
      tenantId: req.user.tenantId,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  });

  static listTiers = asyncHandler(async (req, res) => {
    const data = await TierService.listTiers({ tenantId: req.user.tenantId });
    res.json({ success: true, data });
  });

  static updateTier = asyncHandler(async (req, res) => {
    const data = await TierService.updateTier({
      tenantId: req.user.tenantId,
      tierId:   req.params.id,
      updates:  req.body,
    });
    res.json({ success: true, data });
  });

}

export default TierController;
