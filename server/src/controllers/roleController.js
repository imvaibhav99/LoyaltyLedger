import { asyncHandler } from '../utils/asyncHandler.js';
import RoleService from '../services/roleService.js';

class RoleController {

  static createRole = asyncHandler(async (req, res) => {
    const data = await RoleService.createRole({
      tenantId: req.user.tenantId,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  });

  static listRoles = asyncHandler(async (req, res) => {
    const data = await RoleService.listRoles({ tenantId: req.user.tenantId });
    res.json({ success: true, data });
  });

  static updateRole = asyncHandler(async (req, res) => {
    const data = await RoleService.updateRole({
      tenantId: req.user.tenantId,
      roleId:   req.params.id,
      updates:  req.body,
    });
    res.json({ success: true, data });
  });

}

export default RoleController;
