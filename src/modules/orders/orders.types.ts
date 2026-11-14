import type { PaginationQuery } from '@shared/utils/pagination';

export interface OrderItemDto {
  sku: string;
  quantity: number;
}

export interface OrderDto {
  id: string;
  userId: string;
  items: OrderItemDto[];
  status: 'pending' | 'confirmed' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface PlaceOrderInput {
  userId: string;
  items: OrderItemDto[];
}

export interface ListOrdersInput extends PaginationQuery {
  userId?: string | undefined;
}

/** What other modules and jobs may call. Exposed through `createOrdersModule(...).api`. */
export interface OrdersApi {
  /**
   * Expires every pending order created more than `olderThanMs` ago and resolves to how many
   * were expired. Idempotent: safe to call repeatedly and from several instances at once.
   */
  expirePendingOrders(olderThanMs: number): Promise<number>;
}
