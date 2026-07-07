import EarnRule from '../models/EarnRule.js';
import { ApiError } from '../utils/ApiError.js';
import { statusAI } from '../config/constants.js';

class EarnRuleService {

  static createEarnRule = async ({ tenantId, ...data }) => {
    const rule = await EarnRule.create({ tenantId, ...data });
    return { rule };
  };

  static listEarnRules = async ({ tenantId }) => {
    const rules = await EarnRule.find({ tenantId, status: statusAI.ACTIVE }).sort({ createdAt: -1 });
    return { data: rules };
  };

  static updateEarnRule = async ({ tenantId, ruleId, updates }) => {
    const rule = await EarnRule.findOneAndUpdate(
      { _id: ruleId, tenantId },
      updates,
      { new: true, runValidators: true }
    );
    if (!rule) throw new ApiError(404, 'Earn rule not found');
    return { rule };
  };

  static deleteEarnRule = async ({ tenantId, ruleId }) => {
    const rule = await EarnRule.findOneAndUpdate(
      { _id: ruleId, tenantId },
      { status: statusAI.INACTIVE },
      { new: true }
    );
    if (!rule) throw new ApiError(404, 'Earn rule not found');
    return { rule };
  };

}

export default EarnRuleService;
