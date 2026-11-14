import { logger } from '@shared/lib/logger';

export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export interface Scheduler {
  start(): void;
  /** Stops scheduling new runs and resolves once the runs in flight have finished. */
  stop(): Promise<void>;
}

/**
 * Minimal interval scheduler. A job never overlaps itself: a tick is skipped while the previous
 * run is still going. A failing run is logged and the job runs again on the next tick.
 *
 * It runs inside every app instance, so with N instances each job runs N times per interval.
 * Jobs must therefore be idempotent (see expire-pending-orders.job.ts).
 */
export function createScheduler(jobs: readonly Job[]): Scheduler {
  const timers: NodeJS.Timeout[] = [];
  const running = new Map<string, Promise<void>>();

  function tick(job: Job): void {
    if (running.has(job.name)) {
      logger.warn({ job: job.name }, 'Previous run still in progress, skipping this tick');
      return;
    }
    const run = job
      .run()
      .catch((error: unknown) => {
        logger.error({ err: error, job: job.name }, 'Job failed');
      })
      .finally(() => {
        running.delete(job.name);
      });
    running.set(job.name, run);
  }

  return {
    start() {
      for (const job of jobs) {
        timers.push(
          setInterval(() => {
            tick(job);
          }, job.intervalMs),
        );
        logger.info({ job: job.name, intervalMs: job.intervalMs }, 'Job scheduled');
      }
    },

    async stop() {
      for (const timer of timers) {
        clearInterval(timer);
      }
      timers.length = 0;
      await Promise.all(running.values());
    },
  };
}
