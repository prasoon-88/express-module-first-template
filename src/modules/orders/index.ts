/**
 * Public API of the orders module. Other code may import from this file only.
 */
import type { Router } from 'express';
import type { UsersApi } from '@modules/users';
import type { EventBus } from '@shared/lib/event-bus';
import { logger } from '@shared/lib/logger';
import { createOrdersController } from './orders.controller';
import { createInMemoryOrdersRepository } from './orders.repository.memory';
import { createOrdersRouter } from './orders.routes';
import { createOrdersService } from './orders.service';
import type { OrdersApi } from './orders.types';

export type { OrdersApi } from './orders.types';

export interface OrdersModuleDeps {
  eventBus: EventBus;
  users: UsersApi;
}

export interface OrdersModule {
  router: Router;
  api: OrdersApi;
}

export function createOrdersModule(deps: OrdersModuleDeps): OrdersModule {
  // The one place that chooses the persistence adapter for this module.
  const repository = createInMemoryOrdersRepository();
  logger.info({ module: 'orders', persistence: 'in-memory' }, 'Data is lost on restart');

  const service = createOrdersService({ repository, users: deps.users, eventBus: deps.eventBus });

  return {
    router: createOrdersRouter(createOrdersController(service)),
    api: {
      expirePendingOrders: (olderThanMs) => service.expirePendingOrders(olderThanMs),
    },
  };
}
