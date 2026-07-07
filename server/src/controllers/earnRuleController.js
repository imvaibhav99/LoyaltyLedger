import { asyncHandler } from '../utils/asyncHandler.js';
import EarnRuleService from '../services/earnRuleService.js';

class EarnRuleController {

  static createEarnRule = asyncHandler(async (req, res) => {
    const data = await EarnRuleService.createEarnRule({
      tenantId: req.user.tenantId,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  });

  static listEarnRules = asyncHandler(async (req, res) => {
    const data = await EarnRuleService.listEarnRules({ tenantId: req.user.tenantId });
    res.json({ success: true, data });
  });

  static updateEarnRule = asyncHandler(async (req, res) => {
    const data = await EarnRuleService.updateEarnRule({
      tenantId: req.user.tenantId,
      ruleId:   req.params.id,
      updates:  req.body,
    });
    res.json({ success: true, data });
  });

  static deleteEarnRule = asyncHandler(async (req, res) => {
    const data = await EarnRuleService.deleteEarnRule({
      tenantId: req.user.tenantId,
      ruleId:   req.params.id,
    });
    res.json({ success: true, data });
  });

}

export default EarnRuleController;
