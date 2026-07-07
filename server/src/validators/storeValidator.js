import { z } from 'zod';

export const createStoreSchema = z.object({
  name:    z.string().min(2),
  code:    z.string().min(1).optional(),
  address: z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  pinCode: z.string().regex(/^\d{6}$/).optional(),
  type:    z.enum(['FLAGSHIP', 'OUTLET', 'FRANCHISE', 'ONLINE']).optional(),
});

export const updateStoreSchema = createStoreSchema.partial();
