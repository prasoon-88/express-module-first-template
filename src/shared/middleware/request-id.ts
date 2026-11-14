import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { RequestHandler } from 'express';
import { runWithRequestContext } from '@shared/lib/request-context';

const HEADER = 'X-Request-Id';
/** Incoming ids are echoed into logs and responses, so only a conservative character set is accepted. */
const ACCEPTED_ID = /^[\w.-]{1,128}$/;

/**
 * Accepts the caller's X-Request-Id or generates one, returns it on the response, and runs the
 * rest of the request inside a request context (see request-context.ts). Mount first.
 */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get(HEADER);
    const id = incoming !== undefined && ACCEPTED_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader(HEADER, id);
    runWithRequestContext({ requestId: id }, next);
  };
}

export function getRequestId(res: ServerResponse): string {
  const value = res.getHeader(HEADER);
  return typeof value === 'string' ? value : 'unknown';
}
