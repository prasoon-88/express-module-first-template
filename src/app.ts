import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from '@config/index';
import { createOrdersModule, type OrdersApi } from '@modules/orders';
import { createUsersModule } from '@modules/users';
import { createEventBus, type EventBus } from '@shared/lib/event-bus';
import { createHealthRouter, type ReadinessCheck } from '@shared/lib/health';
import { logger } from '@shared/lib/logger';
import { errorHandler } from '@shared/middleware/error-handler';
import { notFound } from '@shared/middleware/not-found';
import { rateLimiter } from '@shared/middleware/rate-limit';
import { getRequestId, requestId } from '@shared/middleware/request-id';

export interface AppDeps {
  env: Env;
  /** True once shutdown has begun; `/ready` then answers 503 so traffic drains away. */
  isShuttingDown: () => boolean;
  /** Checks for external dependencies (database, broker). Empty until one is added. */
  readinessChecks?: readonly ReadinessCheck[];
}

export interface App {
  app: Express;
  eventBus: EventBus;
  /** Public APIs that code outside the HTTP layer (jobs) needs. */
  orders: OrdersApi;
}

const PROBE_PATHS = new Set(['/health', '/ready']);

/** Composition root: creates the modules, wires them together and mounts them. No logic here. */
export function buildApp(deps: AppDeps): App {
  const { env } = deps;

  const eventBus = createEventBus();
  const users = createUsersModule({ eventBus });
  const orders = createOrdersModule({ eventBus, users: users.api });

  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId());
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => getRequestId(res),
      autoLogging: { ignore: (req) => PROBE_PATHS.has(req.url) },
      // One short line per request; the default serializers log every header.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    createHealthRouter({
      readinessChecks: deps.readinessChecks ?? [],
      isShuttingDown: deps.isShuttingDown,
    }),
  );
  app.use(rateLimiter({ windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX }));
  app.use(express.json({ limit: env.BODY_LIMIT }));

  app.use('/users', users.router);
  app.use('/orders', orders.router);

  app.use(notFound());
  app.use(errorHandler());

  return { app, eventBus, orders: orders.api };
}
