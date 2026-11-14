import { parseEnv } from '@config/index';
import type { ReadinessCheck } from '@shared/lib/health';
import { buildApp, type App } from '../../src/app';

export interface TestAppOptions {
  /** Raw environment overrides, e.g. `{ RATE_LIMIT_MAX: '2' }`. */
  env?: Record<string, string>;
  readinessChecks?: readonly ReadinessCheck[];
  isShuttingDown?: () => boolean;
}

/** Builds the real application with a fresh, isolated in-memory state for each test. */
export function createTestApp(options: TestAppOptions = {}): App {
  return buildApp({
    env: parseEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...options.env }),
    isShuttingDown: options.isShuttingDown ?? (() => false),
    ...(options.readinessChecks ? { readinessChecks: options.readinessChecks } : {}),
  });
}
