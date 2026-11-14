import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getRequestContext } from '@shared/lib/request-context';
import { requestId } from '../request-id';

function createApp() {
  const app = express();
  app.use(requestId());
  app.use(express.json());
  app.post('/context', async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    res.json({ requestId: getRequestContext()?.requestId ?? null });
  });
  return app;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('request id', () => {
  it('generates an id and returns it in the response header', async () => {
    const response = await request(createApp()).post('/context').send({});

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('accepts a well-formed id from the caller', async () => {
    const response = await request(createApp())
      .post('/context')
      .set('X-Request-Id', 'trace-abc.123')
      .send({});

    expect(response.headers['x-request-id']).toBe('trace-abc.123');
  });

  it('replaces an id that could be used for log injection', async () => {
    const response = await request(createApp())
      .post('/context')
      .set('X-Request-Id', 'bad id {"level":60}')
      .send({});

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('exposes the id through the request context, through body parsing and across awaits', async () => {
    const response = await request(createApp())
      .post('/context')
      .set('X-Request-Id', 'trace-1')
      .send({ some: 'body' });

    expect(response.body).toEqual({ requestId: 'trace-1' });
  });
});
