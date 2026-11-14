import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../error-handler';
import { validate } from '../validate';

function createApp() {
  const app = express();
  app.use(express.json());
  app.post(
    '/things/:id',
    validate({
      params: z.object({ id: z.coerce.number().int() }),
      body: z.object({ name: z.string().trim().min(1) }),
      query: z.object({ limit: z.coerce.number().int().min(1).default(10) }),
    }),
    (req, res) => {
      res.json({ params: req.params, body: req.body, query: req.query });
    },
  );
  app.use(errorHandler());
  return app;
}

describe('validate middleware', () => {
  it('replaces params, body and query with the parsed values', async () => {
    const response = await request(createApp())
      .post('/things/7?limit=3')
      .send({ name: '  widget  ', ignored: true });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      params: { id: 7 },
      body: { name: 'widget' },
      query: { limit: 3 },
    });
  });

  it('applies query defaults (req.query is a getter in Express 5)', async () => {
    const response = await request(createApp()).post('/things/7').send({ name: 'widget' });

    expect(response.body).toMatchObject({ query: { limit: 10 } });
  });

  it('reports every issue from every request part in one 400 response', async () => {
    const response = await request(createApp()).post('/things/abc?limit=0').send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    const paths = (response.body as { errors: { path: string }[] }).errors.map(({ path }) => path);
    expect(paths).toEqual(['params.id', 'body.name', 'query.limit']);
  });
});
