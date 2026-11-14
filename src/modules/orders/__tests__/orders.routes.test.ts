import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { UserNotFoundError, type UserDto, type UsersApi } from '@modules/users';
import { createEventBus } from '@shared/lib/event-bus';
import { errorHandler } from '@shared/middleware/error-handler';
import type { Page } from '@shared/types/pagination';
import { createOrdersModule } from '../index';
import type { OrderDto } from '../orders.types';

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

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/orders', createOrdersModule({ eventBus: createEventBus(), users }).router);
  app.use(errorHandler());
  return app;
}

describe('orders routes', () => {
  let app: Express;

  async function placeOrder(userId = KNOWN_USER_ID): Promise<OrderDto> {
    const response = await request(app).post('/orders').send({ userId, items: ITEMS });
    return response.body as OrderDto;
  }

  beforeEach(() => {
    app = createApp();
  });

  it('POST /orders places a pending order', async () => {
    const response = await request(app)
      .post('/orders')
      .send({ userId: KNOWN_USER_ID, items: ITEMS });
    const order = response.body as OrderDto;

    expect(response.status).toBe(201);
    expect(order).toMatchObject({ userId: KNOWN_USER_ID, items: ITEMS, status: 'pending' });
    expect(response.headers['location']).toBe(`/orders/${order.id}`);
  });

  it('POST /orders rejects an invalid body with 400 and the failing fields', async () => {
    const response = await request(app)
      .post('/orders')
      .send({ userId: 'nope', items: [{ sku: '', quantity: 0 }] });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [
        { path: 'body.userId' },
        { path: 'body.items.0.sku' },
        { path: 'body.items.0.quantity' },
      ],
    });
  });

  it('POST /orders answers an unknown user with 404', async () => {
    const response = await request(app)
      .post('/orders')
      .send({ userId: randomUUID(), items: ITEMS });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('GET /orders/:id returns the order', async () => {
    const order = await placeOrder();

    const response = await request(app).get(`/orders/${order.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(order);
  });

  it('GET /orders/:id answers an unknown id with 404', async () => {
    const response = await request(app).get(`/orders/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('GET /orders paginates and filters by user', async () => {
    await placeOrder();
    await placeOrder();

    const all = await request(app).get('/orders?pageSize=1');
    const none = await request(app).get(`/orders?userId=${randomUUID()}`);

    expect(all.status).toBe(200);
    expect(all.body as Page<OrderDto>).toMatchObject({ pageSize: 1, total: 2, totalPages: 2 });
    expect((all.body as Page<OrderDto>).items).toHaveLength(1);
    expect(none.body as Page<OrderDto>).toMatchObject({ total: 0, items: [] });
  });

  it('GET /orders rejects a malformed userId filter with 400', async () => {
    const response = await request(app).get('/orders?userId=abc');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ errors: [{ path: 'query.userId' }] });
  });

  it('POST /orders/:id/confirm confirms once, then answers 409', async () => {
    const order = await placeOrder();

    const first = await request(app).post(`/orders/${order.id}/confirm`);
    const second = await request(app).post(`/orders/${order.id}/confirm`);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ id: order.id, status: 'confirmed' });
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'ORDER_NOT_PENDING' });
  });

  it('POST /orders/:id/confirm answers an unknown id with 404', async () => {
    const response = await request(app).post(`/orders/${randomUUID()}/confirm`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });
});
