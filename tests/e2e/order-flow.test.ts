import type { UserDto } from '@modules/users';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app';

interface OrderResponse {
  id: string;
  userId: string;
  status: string;
}

describe('order flow', () => {
  it('create user -> place order -> order.placed event -> user.orderCount', async () => {
    const { app, eventBus } = createTestApp();

    const createdUser = await request(app)
      .post('/users')
      .send({ email: 'ada@example.com', name: 'Ada' });
    const user = createdUser.body as UserDto;
    expect(createdUser.status).toBe(201);
    expect(user.orderCount).toBe(0);

    const placedOrder = await request(app)
      .post('/orders')
      .send({ userId: user.id, items: [{ sku: 'SKU-1', quantity: 1 }] });
    const order = placedOrder.body as OrderResponse;
    expect(placedOrder.status).toBe(201);
    expect(order).toMatchObject({ userId: user.id, status: 'pending' });

    // The users module reacts to the event asynchronously, after the response was sent.
    await eventBus.drain();

    const reloadedUser = await request(app).get(`/users/${user.id}`);
    expect(reloadedUser.body).toMatchObject({ id: user.id, orderCount: 1 });

    const confirmed = await request(app).post(`/orders/${order.id}/confirm`);
    expect(confirmed.body).toMatchObject({ id: order.id, status: 'confirmed' });

    const listed = await request(app).get(`/orders?userId=${user.id}`);
    expect(listed.body).toMatchObject({ total: 1, items: [{ id: order.id, status: 'confirmed' }] });
  });

  it('expires a stale pending order through the orders public API, as the job does', async () => {
    const { app, orders } = createTestApp();
    const createdUser = await request(app)
      .post('/users')
      .send({ email: 'ada@example.com', name: 'Ada' });
    const placedOrder = await request(app)
      .post('/orders')
      .send({ userId: (createdUser.body as UserDto).id, items: [{ sku: 'SKU-1', quantity: 1 }] });
    const order = placedOrder.body as OrderResponse;

    // A TTL of -1 ms puts the cutoff just after "now", so the order counts as stale.
    await expect(orders.expirePendingOrders(-1)).resolves.toBe(1);

    const reloaded = await request(app).get(`/orders/${order.id}`);
    const confirm = await request(app).post(`/orders/${order.id}/confirm`);
    expect(reloaded.body).toMatchObject({ status: 'expired' });
    expect(confirm.status).toBe(409);
  });

  it('refuses an order for a user that does not exist', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/orders')
      .send({
        userId: '3f2b0c9e-8a51-4c6e-9d57-2f0f6a1b7c11',
        items: [{ sku: 'SKU-1', quantity: 1 }],
      });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});
