import { z } from 'zod';
import { paginationQuerySchema } from '@shared/utils/pagination';

export const placeOrderBodySchema = z.object({
  userId: z.uuid(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1)
    .max(50),
});

export const orderIdParamsSchema = z.object({
  id: z.uuid(),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  userId: z.uuid().optional(),
});

export type PlaceOrderBody = z.infer<typeof placeOrderBodySchema>;
export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
