import type { ValidatedHandler } from '@shared/middleware/validate';
import type { ListOrdersQuery, OrderIdParams, PlaceOrderBody } from './orders.schema';
import type { OrdersService } from './orders.service';

export interface OrdersController {
  place: ValidatedHandler<{ body: PlaceOrderBody }>;
  getById: ValidatedHandler<{ params: OrderIdParams }>;
  list: ValidatedHandler<{ query: ListOrdersQuery }>;
  confirm: ValidatedHandler<{ params: OrderIdParams }>;
}

/** Translates HTTP to service calls and back. No business logic. */
export function createOrdersController(service: OrdersService): OrdersController {
  return {
    async place(req, res) {
      const order = await service.placeOrder(req.body);
      res.status(201).location(`${req.baseUrl}/${order.id}`).json(order);
    },

    async getById(req, res) {
      res.json(await service.getOrderById(req.params.id));
    },

    async list(req, res) {
      res.json(await service.listOrders(req.query));
    },

    async confirm(req, res) {
      res.json(await service.confirmOrder(req.params.id));
    },
  };
}
