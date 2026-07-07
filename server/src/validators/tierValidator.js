import { z } from 'zod';

export const createTierSchema = z.object({
  name:             z.string().min(1),
  isDefault:        z.boolean().optional(),
  narration:        z.string().optional(),
  durationType:     z.enum(['DAILY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'CALENDER_YEARLY', 'FINANCIAL_YEARLY']),
  duration:         z.number().int().min(1),
  pointsMultiplier: z.number().min(1).default(1),
  upgradeVisits:    z.number().int().min(0).optional(),
  upgradeSpends:    z.number().min(0).optional(),
  upgradePoints:    z.number().int().min(0).optional(),
  upgradeRule:      z.enum(['AND', 'OR']).optional(),
  upgradePolicyTierId:   z.string().optional(),
  downgradePolicyTierId: z.string().optional(),
  retainVisits:     z.number().int().min(0).optional(),
  retainSpends:     z.number().min(0).optional(),
  retainPoints:     z.number().int().min(0).optional(),
  retainRule:       z.enum(['AND', 'OR']).optional(),
});

export const updateTierSchema = createTierSchema.partial();
