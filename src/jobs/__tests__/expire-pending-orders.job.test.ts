import { describe, expect, it, vi } from 'vitest';
import { createExpirePendingOrdersJob } from '../expire-pending-orders.job';

describe('expire-pending-orders job', () => {
  it('asks the orders module to expire orders older than the TTL', async () => {
    const expirePendingOrders = vi.fn(() => Promise.resolve(2));
    const job = createExpirePendingOrdersJob({
      orders: { expirePendingOrders },
      ttlMs: 900_000,
      intervalMs: 60_000,
    });

    await job.run();

    expect(job).toMatchObject({ name: 'expire-pending-orders', intervalMs: 60_000 });
    expect(expirePendingOrders).toHaveBeenCalledExactlyOnceWith(900_000);
  });
});
