import { z } from 'zod';

export const updateAccountSchema = z.object({
  name:  z.string().min(2).optional(),
  email: z.string().email().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
});

export const updateBusinessSchema = z.object({
  businessName: z.string().min(2).optional(),
  billingEmail: z.string().email().optional(),
});
