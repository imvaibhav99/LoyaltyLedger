import { z } from 'zod';

export const createMemberSchema = z.object({
  name:    z.string().min(2),
  phone:   z.string().min(10).max(15),
  email:   z.string().email().optional(),
  dob:     z.string().optional(),
  gender:  z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  storeId: z.string().optional(),
  address: z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  pinCode: z.string().regex(/^\d{6}$/).optional(),
});

export const updateMemberSchema = createMemberSchema.partial();
