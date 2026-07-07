import { z } from 'zod';

const itemSchema = z.object({
  skuCode:  z.string().optional(),
  skuName:  z.string().optional(),
  quantity: z.number().int().min(1),
  rate:     z.number().min(0),
  amount:   z.number().min(0),
});

export const createOrderSchema = z.object({
  memberId:       z.string(),
  billId:         z.string().min(1),
  items:          z.array(itemSchema).optional(),
  totalAmount:    z.number().min(0),
  storeId:        z.string().optional(),
  walletUsed:     z.boolean().default(false),
  pointsToRedeem: z.number().int().min(0).default(0),
  offerDiscount:  z.number().min(0).optional(),
});
