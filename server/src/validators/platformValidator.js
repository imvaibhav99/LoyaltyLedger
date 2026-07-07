import { z } from 'zod';

export const updateTenantStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'cancelled']),
});
