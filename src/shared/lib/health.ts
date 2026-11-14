import { Router } from 'express';
import { logger } from './logger';

/** A dependency the app needs before it can serve traffic. `check` rejects when it is unavailable. */
export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

export interface HealthRouterDeps {
  readinessChecks: readonly ReadinessCheck[];
  isShuttingDown: () => boolean;
}

/** `/health` is liveness (the process responds). `/ready` is readiness (it can take traffic). */
export function createHealthRouter(deps: HealthRouterDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    if (deps.isShuttingDown()) {
      res.status(503).json({ status: 'shutting_down' });
      return;
    }

    const results = await Promise.allSettled(deps.readinessChecks.map(({ check }) => check()));
    const checks: Record<string, 'ok' | 'failed'> = {};
    results.forEach((result, index) => {
      const name = deps.readinessChecks[index]?.name ?? String(index);
      checks[name] = result.status === 'fulfilled' ? 'ok' : 'failed';
      if (result.status === 'rejected') {
        logger.warn({ err: result.reason, check: name }, 'Readiness check failed');
      }
    });

    const ready = results.every((result) => result.status === 'fulfilled');
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable', checks });
  });

  return router;
}
