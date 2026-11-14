import type { OrderEntity } from './orders.model';
import type { OrdersRepository } from './orders.repository';

/**
 * In-memory adapter: data lives in this process and is lost on restart.
 * Entities are cloned on the way in and out, as a real database would, so callers can never
 * change stored state by mutating an object they hold.
 */
export function createInMemoryOrdersRepository(): OrdersRepository {
  const orders = new Map<string, OrderEntity>();

  return {
    async insert(order) {
      orders.set(order.id, structuredClone(order));
    },

    async findById(id) {
      const order = orders.get(id);
      return order ? structuredClone(order) : null;
    },

    async list({ userId, offset, limit }) {
      const matching = [...orders.values()]
        .filter((order) => userId === undefined || order.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
      return {
        items: matching.slice(offset, offset + limit).map((order) => structuredClone(order)),
        total: matching.length,
      };
    },

    async transitionStatus(id, from, to, at) {
      const order = orders.get(id);
      if (order?.status !== from) {
        return null;
      }
      order.status = to;
      order.updatedAt = new Date(at);
      return structuredClone(order);
    },

    async expirePendingCreatedBefore(cutoff, at) {
      let expired = 0;
      for (const order of orders.values()) {
        if (order.status === 'pending' && order.createdAt < cutoff) {
          order.status = 'expired';
          order.updatedAt = new Date(at);
          expired += 1;
        }
      }
      return expired;
    },
  };
}
