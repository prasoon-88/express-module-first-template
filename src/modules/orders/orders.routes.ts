import { Router } from 'express';
import { validate } from '@shared/middleware/validate';
import type { OrdersController } from './orders.controller';
import { listOrdersQuerySchema, orderIdParamsSchema, placeOrderBodySchema } from './orders.schema';

/** HTTP wiring only: path, validation, controller method. */
export function createOrdersRouter(controller: OrdersController): Router {
  const router = Router();

  router.post('/', validate({ body: placeOrderBodySchema }), controller.place);
  router.get('/', validate({ query: listOrdersQuerySchema }), controller.list);
  router.get('/:id', validate({ params: orderIdParamsSchema }), controller.getById);
  router.post('/:id/confirm', validate({ params: orderIdParamsSchema }), controller.confirm);

  return router;
}
