import { env } from '@config/index';
import { logger } from '@shared/lib/logger';
import { buildApp } from './app';
import { createExpirePendingOrdersJob } from './jobs/expire-pending-orders.job';
import { createScheduler } from './jobs/scheduler';

let shuttingDown = false;

const { app, eventBus, orders } = buildApp({ env, isShuttingDown: () => shuttingDown });

const scheduler = createScheduler([
  createExpirePendingOrdersJob({
    orders,
    ttlMs: env.ORDER_PENDING_TTL_MS,
    intervalMs: env.EXPIRE_ORDERS_INTERVAL_MS,
  }),
]);

const server = app.listen(env.PORT, env.HOST);

server.once('listening', () => {
  logger.info({ host: env.HOST, port: env.PORT, env: env.NODE_ENV }, 'Server listening');
  scheduler.start();
});

server.once('error', (error) => {
  logger.fatal({ err: error }, 'Server failed to start');
  process.exit(1);
});

function closeServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Stops accepting connections and resolves once in-flight requests have finished.
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    // Keep-alive connections with no request in flight would otherwise hold the server open.
    server.closeIdleConnections();
  });
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true; // `/ready` now answers 503.
  logger.info({ reason }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error({ timeoutMs: env.SHUTDOWN_TIMEOUT_MS }, 'Shutdown timed out, forcing exit');
    process.exit(1);
  }, env.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  let code = exitCode;
  try {
    await scheduler.stop();
    await closeServer();
    await eventBus.drain();
  } catch (error) {
    logger.error({ err: error }, 'Shutdown did not complete cleanly');
    code = 1;
  }

  logger.info('Shutdown complete');
  logger.flush(() => {
    process.exit(code);
  });
}

process.once('SIGTERM', () => void shutdown('SIGTERM', 0));
process.once('SIGINT', () => void shutdown('SIGINT', 0));

// After either of these the process state cannot be trusted: log, drain and exit non-zero.
process.once('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});
process.once('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});
