import Role from '../models/Role.js';
import { ApiError } from '../utils/ApiError.js';

class RoleService {

  static createRole = async ({ tenantId, name, level, access }) => {
    const role = await Role.create({ tenantId, name, level, access });
    return { role };
  };

  static listRoles = async ({ tenantId }) => {
    const roles = await Role.find({ tenantId });
    return { data: roles };
  };

  static updateRole = async ({ tenantId, roleId, updates }) => {
    const role = await Role.findOneAndUpdate(
      { _id: roleId, tenantId },
      updates,
      { new: true, runValidators: true }
    );
    if (!role) throw new ApiError(404, 'Role not found');
    return { role };
  };

}

export default RoleService;
