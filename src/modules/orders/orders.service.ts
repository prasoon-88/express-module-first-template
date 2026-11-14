import { randomUUID } from 'node:crypto';
import type { UsersApi } from '@modules/users';
import type { EventBus } from '@shared/lib/event-bus';
import type { Page } from '@shared/types/pagination';
import { toOffset, toPage } from '@shared/utils/pagination';
import { OrderNotFoundError, OrderNotPendingError } from './orders.errors';
import type { OrderPlacedEvent } from './orders.events';
import type { OrderEntity } from './orders.model';
import type { OrdersRepository } from './orders.repository';
import type { ListOrdersInput, OrderDto, PlaceOrderInput } from './orders.types';

export interface OrdersService {
  placeOrder(input: PlaceOrderInput): Promise<OrderDto>;
  getOrderById(id: string): Promise<OrderDto>;
  listOrders(input: ListOrdersInput): Promise<Page<OrderDto>>;
  confirmOrder(id: string): Promise<OrderDto>;
  expirePendingOrders(olderThanMs: number): Promise<number>;
}

export interface OrdersServiceDeps {
  repository: OrdersRepository;
  /** The users module's public API. Orders never touches user storage itself. */
  users: UsersApi;
  eventBus: EventBus;
}

/** Entities stay inside the module; everything that leaves the service is a DTO. */
function toOrderDto(order: OrderEntity): OrderDto {
  return {
    id: order.id,
    userId: order.userId,
    items: order.items.map(({ sku, quantity }) => ({ sku, quantity })),
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function createOrdersService(deps: OrdersServiceDeps): OrdersService {
  const { repository, users, eventBus } = deps;

  return {
    async placeOrder(input) {
      // Rejects with the users module's UserNotFoundError when the user does not exist.
      await users.getUserById(input.userId);

      const now = new Date();
      const order: OrderEntity = {
        id: randomUUID(),
        userId: input.userId,
        items: input.items.map(({ sku, quantity }) => ({ sku, quantity })),
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await repository.insert(order);

      // Published only after the order is stored. Other modules react without orders knowing them.
      const event: OrderPlacedEvent = {
        orderId: order.id,
        userId: order.userId,
        placedAt: now.toISOString(),
      };
      eventBus.publish('order.placed', event);

      return toOrderDto(order);
    },

    async getOrderById(id) {
      const order = await repository.findById(id);
      if (!order) {
        throw new OrderNotFoundError(id);
      }
      return toOrderDto(order);
    },

    async listOrders(input) {
      const { items, total } = await repository.list({ userId: input.userId, ...toOffset(input) });
      return toPage(items.map(toOrderDto), total, input);
    },

    async confirmOrder(id) {
      const confirmed = await repository.transitionStatus(id, 'pending', 'confirmed', new Date());
      if (confirmed) {
        return toOrderDto(confirmed);
      }
      const current = await repository.findById(id);
      if (!current) {
        throw new OrderNotFoundError(id);
      }
      throw new OrderNotPendingError(id, current.status);
    },

    async expirePendingOrders(olderThanMs) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - olderThanMs);
      return repository.expirePendingCreatedBefore(cutoff, now);
    },
  };
}
