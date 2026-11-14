import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { OrderEntity } from '../orders.model';
import type { OrdersRepository } from '../orders.repository';

function buildOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  const createdAt = overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
  return {
    id: randomUUID(),
    userId: randomUUID(),
    items: [{ sku: 'SKU-1', quantity: 2 }],
    status: 'pending',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

/**
 * The behaviour every OrdersRepository adapter must have. Run it against each adapter:
 *
 *   describeOrdersRepositoryContract('postgres', () => createPostgresOrdersRepository(testPool));
 *
 * `createRepository` must return an empty repository on every call.
 */
export function describeOrdersRepositoryContract(
  adapterName: string,
  createRepository: () => OrdersRepository | Promise<OrdersRepository>,
): void {
  describe(`OrdersRepository contract: ${adapterName}`, () => {
    let repository: OrdersRepository;

    beforeEach(async () => {
      repository = await createRepository();
    });

    it('finds an inserted order by id', async () => {
      const order = buildOrder();
      await repository.insert(order);

      await expect(repository.findById(order.id)).resolves.toEqual(order);
    });

    it('resolves to null for an unknown id', async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });

    it('does not share state with the objects it receives or returns', async () => {
      const order = buildOrder();
      await repository.insert(order);
      order.items.push({ sku: 'ADDED-AFTER-INSERT', quantity: 1 });

      const found = await repository.findById(order.id);
      expect(found?.items).toHaveLength(1);

      found?.items.push({ sku: 'ADDED-AFTER-READ', quantity: 1 });
      const again = await repository.findById(order.id);
      expect(again?.items).toHaveLength(1);
    });

    it('lists by creation time with offset, limit and the overall total', async () => {
      const second = buildOrder({ createdAt: new Date('2026-01-02T00:00:00.000Z') });
      const first = buildOrder({ createdAt: new Date('2026-01-01T00:00:00.000Z') });
      const third = buildOrder({ createdAt: new Date('2026-01-03T00:00:00.000Z') });
      await repository.insert(second);
      await repository.insert(first);
      await repository.insert(third);

      const page = await repository.list({ offset: 1, limit: 5 });

      expect(page.items.map(({ id }) => id)).toEqual([second.id, third.id]);
      expect(page.total).toBe(3);
    });

    it('filters the list by user', async () => {
      const userId = randomUUID();
      const mine = buildOrder({ userId });
      await repository.insert(mine);
      await repository.insert(buildOrder());

      const page = await repository.list({ userId, offset: 0, limit: 10 });

      expect(page.items.map(({ id }) => id)).toEqual([mine.id]);
      expect(page.total).toBe(1);
    });

    it('moves an order to a new status when it is in the expected one', async () => {
      const order = buildOrder();
      const at = new Date('2026-02-01T00:00:00.000Z');
      await repository.insert(order);

      const updated = await repository.transitionStatus(order.id, 'pending', 'confirmed', at);

      expect(updated).toEqual({ ...order, status: 'confirmed', updatedAt: at });
      await expect(repository.findById(order.id)).resolves.toEqual(updated);
    });

    it('refuses the transition when the order is not in the expected status', async () => {
      const order = buildOrder({ status: 'expired' });
      await repository.insert(order);

      await expect(
        repository.transitionStatus(order.id, 'pending', 'confirmed', new Date()),
      ).resolves.toBeNull();
      await expect(repository.findById(order.id)).resolves.toEqual(order);
    });

    it('refuses the transition for an unknown order', async () => {
      await expect(
        repository.transitionStatus(randomUUID(), 'pending', 'confirmed', new Date()),
      ).resolves.toBeNull();
    });

    it('expires only pending orders created before the cutoff', async () => {
      const cutoff = new Date('2026-01-10T00:00:00.000Z');
      const at = new Date('2026-01-11T00:00:00.000Z');
      const stale = buildOrder({ createdAt: new Date('2026-01-09T00:00:00.000Z') });
      const fresh = buildOrder({ createdAt: new Date('2026-01-10T00:00:00.000Z') });
      const staleButConfirmed = buildOrder({
        createdAt: new Date('2026-01-09T00:00:00.000Z'),
        status: 'confirmed',
      });
      await repository.insert(stale);
      await repository.insert(fresh);
      await repository.insert(staleButConfirmed);

      await expect(repository.expirePendingCreatedBefore(cutoff, at)).resolves.toBe(1);

      await expect(repository.findById(stale.id)).resolves.toMatchObject({
        status: 'expired',
        updatedAt: at,
      });
      await expect(repository.findById(fresh.id)).resolves.toEqual(fresh);
      await expect(repository.findById(staleButConfirmed.id)).resolves.toEqual(staleButConfirmed);
    });

    it('expiring is idempotent', async () => {
      const cutoff = new Date('2026-01-10T00:00:00.000Z');
      await repository.insert(buildOrder({ createdAt: new Date('2026-01-09T00:00:00.000Z') }));

      await expect(repository.expirePendingCreatedBefore(cutoff, new Date())).resolves.toBe(1);
      await expect(repository.expirePendingCreatedBefore(cutoff, new Date())).resolves.toBe(0);
    });
  });
}
