import { z } from 'zod';

export const createEarnRuleSchema = z.object({
  name:            z.string().min(1),
  tierId:          z.string().nullable().optional(),
  transactionUnit: z.number().int().min(1),
  pointsPerUnit:   z.number().int().min(1),
  maxPoints:       z.number().int().min(0).optional(),
  expiryDays:      z.number().int().min(1),
});

export const updateEarnRuleSchema = createEarnRuleSchema.partial();
