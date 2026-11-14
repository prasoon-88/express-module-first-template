import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { TooManyRequestsError } from '@shared/errors';

export interface RateLimiterOptions {
  windowMs: number;
  limit: number;
}

/**
 * Per-client-IP rate limit. Counters live in this process's memory, so with N instances the
 * effective limit is N times `limit`. Use a shared store (e.g. rate-limit-redis) to fix that.
 */
export function rateLimiter(options: RateLimiterOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new TooManyRequestsError());
    },
  });
}
