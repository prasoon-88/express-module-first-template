import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/test-app';

describe('health and readiness', () => {
  it('GET /health reports liveness', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /ready is 200 when every readiness check passes', async () => {
    const { app } = createTestApp({
      readinessChecks: [{ name: 'database', check: () => Promise.resolve() }],
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready', checks: { database: 'ok' } });
  });

  it('GET /ready is 503 when a readiness check fails', async () => {
    const { app } = createTestApp({
      readinessChecks: [
        { name: 'database', check: () => Promise.reject(new Error('connection refused')) },
        { name: 'cache', check: () => Promise.resolve() },
      ],
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      checks: { database: 'failed', cache: 'ok' },
    });
  });

  it('GET /ready is 503 while shutting down, and /health stays 200', async () => {
    const { app } = createTestApp({ isShuttingDown: () => true });

    const ready = await request(app).get('/ready');
    const health = await request(app).get('/health');

    expect(ready.status).toBe(503);
    expect(ready.body).toEqual({ status: 'shutting_down' });
    expect(health.status).toBe(200);
  });
});

describe('application shell', () => {
  it('answers unknown routes with a 404 problem document carrying the request id', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/nope').set('X-Request-Id', 'req-404');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.headers['x-request-id']).toBe('req-404');
    expect(response.body).toMatchObject({
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      requestId: 'req-404',
    });
  });

  it('answers malformed JSON with 400', async () => {
    const { app } = createTestApp();

    const response = await request(app)
      .post('/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'MALFORMED_JSON' });
  });

  it('answers an oversized body with 413', async () => {
    const { app } = createTestApp({ env: { BODY_LIMIT: '1kb' } });

    const response = await request(app)
      .post('/anything')
      .send({ padding: 'x'.repeat(2048) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rate limits per client with 429, but never the health probes', async () => {
    const { app } = createTestApp({ env: { RATE_LIMIT_MAX: '2' } });

    await request(app).get('/nope');
    await request(app).get('/nope');
    const limited = await request(app).get('/nope');
    const health = await request(app).get('/health');

    expect(limited.status).toBe(429);
    expect(limited.body).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(health.status).toBe(200);
  });

  it('sets security headers', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
