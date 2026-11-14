import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env';

describe('parseEnv', () => {
  it('applies defaults when nothing is set', () => {
    const env = parseEnv({});

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      SHUTDOWN_TIMEOUT_MS: 10_000,
    });
  });

  it('coerces numeric strings', () => {
    const env = parseEnv({ PORT: '8080', RATE_LIMIT_MAX: '5' });

    expect(env.PORT).toBe(8080);
    expect(env.RATE_LIMIT_MAX).toBe(5);
  });

  it('rejects invalid values and names every offending variable', () => {
    expect(() => parseEnv({ PORT: 'not-a-port', NODE_ENV: 'staging' })).toThrow(
      /Invalid environment configuration[\s\S]*NODE_ENV[\s\S]*PORT/,
    );
  });
});
