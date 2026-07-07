import { z } from 'zod';

export const createStaffSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['MERCHANT_MANAGER', 'MERCHANT_STAFF']),
  roleId:   z.string().optional(),
});

export const createRoleSchema = z.object({
  name:  z.string().min(2),
  level: z.number().int().min(1).max(2).optional(),
  access: z.array(z.object({
    module: z.enum(['members', 'transactions', 'analytics', 'programs', 'staff', 'roles', 'stores', 'billing', 'adjustments']),
    read:   z.boolean().default(false),
    write:  z.boolean().default(false),
  })).min(1),
});

export const updateRoleSchema = createRoleSchema.partial();
