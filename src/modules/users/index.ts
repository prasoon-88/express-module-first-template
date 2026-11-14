/**
 * Public API of the users module. Other code may import from this file only.
 */
import type { Router } from 'express';
import type { EventBus } from '@shared/lib/event-bus';
import { logger } from '@shared/lib/logger';
import { createUsersController } from './users.controller';
import { registerUsersEventHandlers } from './users.events';
import { createInMemoryUsersRepository } from './users.repository.memory';
import { createUsersRouter } from './users.routes';
import { createUsersService } from './users.service';
import type { UsersApi } from './users.types';

export { UserNotFoundError } from './users.errors';
export type { UserDto, UsersApi } from './users.types';

export interface UsersModuleDeps {
  eventBus: EventBus;
}

export interface UsersModule {
  router: Router;
  api: UsersApi;
}

export function createUsersModule(deps: UsersModuleDeps): UsersModule {
  // The one place that chooses the persistence adapter for this module.
  const repository = createInMemoryUsersRepository();
  logger.info({ module: 'users', persistence: 'in-memory' }, 'Data is lost on restart');

  const service = createUsersService({ repository });
  registerUsersEventHandlers(deps.eventBus, service);

  return {
    router: createUsersRouter(createUsersController(service)),
    api: {
      getUserById: (id) => service.getUserById(id),
    },
  };
}
