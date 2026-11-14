import type { OrdersApi } from '@modules/orders';
import { logger } from '@shared/lib/logger';
import type { Job } from './scheduler';

export interface ExpirePendingOrdersJobDeps {
  /** The orders module's public API. Jobs never reach into a module's internals. */
  orders: OrdersApi;
  ttlMs: number;
  intervalMs: number;
}

/**
 * Expires orders that stayed pending longer than `ttlMs`.
 * Safe to run from several instances at once: the underlying operation is an atomic,
 * idempotent "pending and older than the cutoff -> expired" update.
 */
export function createExpirePendingOrdersJob(deps: ExpirePendingOrdersJobDeps): Job {
  return {
    name: 'expire-pending-orders',
    intervalMs: deps.intervalMs,
    async run() {
      const expired = await deps.orders.expirePendingOrders(deps.ttlMs);
      if (expired > 0) {
        logger.info({ expired }, 'Expired pending orders');
      }
    },
  };
}
