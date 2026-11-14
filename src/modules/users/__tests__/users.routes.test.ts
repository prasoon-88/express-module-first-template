import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEventBus } from '@shared/lib/event-bus';
import { errorHandler } from '@shared/middleware/error-handler';
import type { Page } from '@shared/types/pagination';
import { createUsersModule, type UserDto } from '../index';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/users', createUsersModule({ eventBus: createEventBus() }).router);
  app.use(errorHandler());
  return app;
}

describe('users routes', () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
  });

  it('POST /users creates a user', async () => {
    const response = await request(app)
      .post('/users')
      .send({ email: '  Ada@Example.com ', name: ' Ada ' });
    const user = response.body as UserDto;

    expect(response.status).toBe(201);
    expect(user).toMatchObject({ email: 'ada@example.com', name: 'Ada', orderCount: 0 });
    expect(response.headers['location']).toBe(`/users/${user.id}`);
  });

  it('POST /users rejects an invalid body with 400 and the failing fields', async () => {
    const response = await request(app).post('/users').send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      errors: [{ path: 'body.email' }, { path: 'body.name' }],
    });
  });

  it('POST /users answers a duplicate email with 409', async () => {
    await request(app).post('/users').send({ email: 'ada@example.com', name: 'Ada' });

    const response = await request(app)
      .post('/users')
      .send({ email: 'ADA@example.com', name: 'Other' });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'EMAIL_ALREADY_IN_USE' });
  });

  it('GET /users/:id returns the user', async () => {
    const created = await request(app)
      .post('/users')
      .send({ email: 'ada@example.com', name: 'Ada' });
    const { id } = created.body as UserDto;

    const response = await request(app).get(`/users/${id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created.body);
  });

  it('GET /users/:id answers an unknown id with 404', async () => {
    const response = await request(app).get(`/users/${randomUUID()}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('GET /users/:id rejects a malformed id with 400', async () => {
    const response = await request(app).get('/users/123');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ errors: [{ path: 'params.id' }] });
  });

  it('GET /users paginates', async () => {
    for (const name of ['a', 'b', 'c']) {
      await request(app)
        .post('/users')
        .send({ email: `${name}@example.com`, name });
    }

    const response = await request(app).get('/users?page=1&pageSize=2');
    const page = response.body as Page<UserDto>;

    expect(response.status).toBe(200);
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.items.map(({ name }) => name)).toEqual(['a', 'b']);
  });

  it('GET /users rejects an out-of-range page size with 400', async () => {
    const response = await request(app).get('/users?pageSize=1000');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ errors: [{ path: 'query.pageSize' }] });
  });
});
