import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError, ConflictError } from '@shared/errors';
import { errorHandler } from '../error-handler';
import { requestId } from '../request-id';

function createApp(error: unknown) {
  const app = express();
  app.use(requestId());
  app.get('/boom', () => {
    throw error;
  });
  app.get('/async-boom', async () => {
    await Promise.resolve();
    throw error;
  });
  app.use(errorHandler());
  return app;
}

describe('error handler', () => {
  it('maps an HttpError to an RFC 9457 problem document', async () => {
    const error = new ConflictError('Email is already in use', 'EMAIL_IN_USE');

    const response = await request(createApp(error)).get('/boom').set('X-Request-Id', 'req-1');

    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'Email is already in use',
      instance: '/boom',
      code: 'EMAIL_IN_USE',
      requestId: 'req-1',
    });
  });

  it('handles errors thrown from async handlers', async () => {
    const response = await request(createApp(new ConflictError())).get('/async-boom');

    expect(response.status).toBe(409);
  });

  it.each([
    ['an unknown error', new Error('connection string postgres://user:secret@db')],
    ['an AppError without an HTTP status', new AppError('DOMAIN_RULE', 'internal detail')],
    ['a thrown non-error value', 'just a string'],
  ])('answers %s with a generic 500 that leaks nothing', async (_label, error) => {
    const response = await request(createApp(error)).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      title: 'Internal Server Error',
      detail: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/secret|internal detail|just a string/);
  });
});
