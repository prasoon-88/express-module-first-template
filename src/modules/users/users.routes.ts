import { Router } from 'express';
import { validate } from '@shared/middleware/validate';
import type { UsersController } from './users.controller';
import { createUserBodySchema, listUsersQuerySchema, userIdParamsSchema } from './users.schema';

/** HTTP wiring only: path, validation, controller method. */
export function createUsersRouter(controller: UsersController): Router {
  const router = Router();

  router.post('/', validate({ body: createUserBodySchema }), controller.create);
  router.get('/', validate({ query: listUsersQuerySchema }), controller.list);
  router.get('/:id', validate({ params: userIdParamsSchema }), controller.getById);

  return router;
}
