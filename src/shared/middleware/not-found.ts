import type { RequestHandler } from 'express';
import { NotFoundError } from '@shared/errors';

/** Mount after every router: turns an unmatched request into a 404 handled by the error handler. */
export function notFound(): RequestHandler {
  return (req) => {
    throw new NotFoundError(`Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND');
  };
}
