import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters'),
  ownerName:    z.string().min(2, 'Name must be at least 2 characters'),
  email:        z.string().email('Invalid email format'),
  password:     z.string().min(8, 'Password must be at least 8 characters'),
  plan:         z.enum(['starter', 'growth', 'enterprise']).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
