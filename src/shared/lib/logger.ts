import { pino } from 'pino';
import { env } from '@config/index';
import { getRequestContext } from './request-context';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  // Adds the request id to every line logged while a request is being handled.
  mixin() {
    const context = getRequestContext();
    return context ? { requestId: context.requestId } : {};
  },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});
