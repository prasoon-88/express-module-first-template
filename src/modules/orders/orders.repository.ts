import type { OrderEntity, OrderStatus } from './orders.model';

export interface ListOrdersParams {
  userId?: string | undefined;
  offset: number;
  limit: number;
}

export interface OrdersPage {
  items: OrderEntity[];
  total: number;
}

/**
 * Persistence port of the orders module: the only persistence contract the service sees.
 * Every adapter (`orders.repository.<driver>.ts`) must pass the contract suite in
 * `__tests__/orders.repository.contract.ts`.
 */
export interface OrdersRepository {
  insert(order: OrderEntity): Promise<void>;
  findById(id: string): Promise<OrderEntity | null>;
  /** Ordered by `createdAt` ascending, then `id`. `total` counts every match, not just the page. */
  list(params: ListOrdersParams): Promise<OrdersPage>;
  /**
   * Atomic compare-and-set of the status: moves the order from `from` to `to` and resolves to
   * the updated order, or to null when the order does not exist or is not in `from`.
   * (SQL: `UPDATE ... WHERE id = ? AND status = ?`.)
   */
  transitionStatus(
    id: string,
    from: OrderStatus,
    to: OrderStatus,
    at: Date,
  ): Promise<OrderEntity | null>;
  /**
   * Atomically expires every pending order created before `cutoff` and resolves to how many
   * changed. Running it twice, or from two instances at once, expires each order exactly once.
   */
  expirePendingCreatedBefore(cutoff: Date, at: Date): Promise<number>;
}
