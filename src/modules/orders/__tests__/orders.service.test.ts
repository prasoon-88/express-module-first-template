import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { UserNotFoundError, type UserDto, type UsersApi } from '@modules/users';
import { createEventBus, type EventBus } from '@shared/lib/event-bus';
import { OrderNotFoundError, OrderNotPendingError } from '../orders.errors';
import { createInMemoryOrdersRepository } from '../orders.repository.memory';
import { createOrdersService, type OrdersService } from '../orders.service';

const KNOWN_USER_ID = randomUUID();
const ITEMS = [{ sku: 'SKU-1', quantity: 2 }];

/** Stand-in for the users module: orders only ever sees its public API. */
const users: UsersApi = {
  getUserById(id) {
    if (id !== KNOWN_USER_ID) {
      return Promise.reject(new UserNotFoundError(id));
    }
    const user: UserDto = {
      id,
      email: 'ada@example.com',
      name: 'Ada',
      orderCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    return Promise.resolve(user);
  },
};

describe('orders service', () => {
  let service: OrdersService;
  let eventBus: EventBus;
  let orderPlaced: Mock<(event: unknown) => void>;

  beforeEach(() => {
    eventBus = createEventBus();
    orderPlaced = vi.fn<(event: unknown) => void>();
    eventBus.subscribe('order.placed', orderPlaced);
    service = createOrdersService({
      repository: createInMemoryOrdersRepository(),
      users,
      eventBus,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('places a pending order and publishes order.placed', async () => {
    const order = await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });
    await eventBus.drain();

    expect(order).toMatchObject({ userId: KNOWN_USER_ID, items: ITEMS, status: 'pending' });
    expect(orderPlaced).toHaveBeenCalledExactlyOnceWith({
      orderId: order.id,
      userId: KNOWN_USER_ID,
      placedAt: order.createdAt,
    });
  });

  it('refuses an order for an unknown user and publishes nothing', async () => {
    await expect(service.placeOrder({ userId: randomUUID(), items: ITEMS })).rejects.toThrow(
      UserNotFoundError,
    );
    await eventBus.drain();

    expect(orderPlaced).not.toHaveBeenCalled();
    await expect(service.listOrders({ page: 1, pageSize: 10 })).resolves.toMatchObject({
      total: 0,
    });
  });

  it('gets an order by id', async () => {
    const order = await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });

    await expect(service.getOrderById(order.id)).resolves.toEqual(order);
  });

  it('throws OrderNotFoundError for an unknown id', async () => {
    await expect(service.getOrderById(randomUUID())).rejects.toThrow(OrderNotFoundError);
  });

  it('lists orders, optionally for one user', async () => {
    await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });
    await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });

    await expect(
      service.listOrders({ page: 1, pageSize: 10, userId: KNOWN_USER_ID }),
    ).resolves.toMatchObject({ total: 2 });
    await expect(
      service.listOrders({ page: 1, pageSize: 10, userId: randomUUID() }),
    ).resolves.toMatchObject({ total: 0, items: [] });
  });

  it('confirms a pending order', async () => {
    const order = await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });

    await expect(service.confirmOrder(order.id)).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('refuses to confirm an order twice', async () => {
    const order = await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });
    await service.confirmOrder(order.id);

    await expect(service.confirmOrder(order.id)).rejects.toThrow(OrderNotPendingError);
  });

  it('throws OrderNotFoundError when confirming an unknown order', async () => {
    await expect(service.confirmOrder(randomUUID())).rejects.toThrow(OrderNotFoundError);
  });

  it('expires pending orders older than the TTL, and only those', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    const stale = await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });
    const staleButConfirmed = await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });
    await service.confirmOrder(staleButConfirmed.id);

    vi.setSystemTime(new Date('2026-01-01T00:20:00.000Z'));
    const fresh = await service.placeOrder({ userId: KNOWN_USER_ID, items: ITEMS });

    await expect(service.expirePendingOrders(15 * 60_000)).resolves.toBe(1);
    await expect(service.expirePendingOrders(15 * 60_000)).resolves.toBe(0);

    await expect(service.getOrderById(stale.id)).resolves.toMatchObject({ status: 'expired' });
    await expect(service.getOrderById(fresh.id)).resolves.toMatchObject({ status: 'pending' });
    await expect(service.getOrderById(staleButConfirmed.id)).resolves.toMatchObject({
      status: 'confirmed',
    });
    await expect(service.confirmOrder(stale.id)).rejects.toThrow(OrderNotPendingError);
  });
});
