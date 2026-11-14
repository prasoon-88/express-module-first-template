import { STATUS_CODES } from 'node:http';
import type { ErrorRequestHandler } from 'express';
import { BadRequestError, HttpError, PayloadTooLargeError } from '@shared/errors';
import { logger } from '@shared/lib/logger';
import { getRequestId } from './request-id';

/** RFC 9457 problem details, extended with `code`, `requestId` and (for validation) `errors`. */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
  errors?: unknown;
}

/** Shape of the client errors raised by Express and its body parsers (the `http-errors` package). */
interface ExposedClientError {
  status: number;
  expose: true;
  type?: unknown;
}

function isExposedClientError(error: unknown): error is ExposedClientError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
}

/** Returns the error as an HttpError when it is safe to describe to the client, else undefined. */
function toHttpError(error: unknown): HttpError | undefined {
  if (error instanceof HttpError) {
    return error;
  }
  if (isExposedClientError(error)) {
    if (error.type === 'entity.parse.failed') {
      return new BadRequestError('Request body is not valid JSON', 'MALFORMED_JSON');
    }
    if (error.type === 'entity.too.large') {
      return new PayloadTooLargeError();
    }
    return new HttpError(error.status, 'BAD_REQUEST', STATUS_CODES[error.status] ?? 'Bad request');
  }
  return undefined;
}

/**
 * The single place where errors become HTTP responses. Mount last.
 * Anything that is not a known client error is logged in full and answered with a generic 500,
 * so internals never leak.
 */
export function errorHandler(): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      // The response has started; let Express close the connection.
      next(error);
      return;
    }

    const requestId = getRequestId(res);
    const httpError = toHttpError(error);
    const status = httpError?.status ?? 500;

    if (status >= 500) {
      logger.error({ err: error }, 'Request failed with an unexpected error');
    } else {
      logger.debug({ err: error }, 'Request rejected');
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail: httpError?.message ?? 'An unexpected error occurred',
      instance: req.path,
      code: httpError?.code ?? 'INTERNAL_ERROR',
      requestId,
      ...(httpError?.details === undefined ? {} : { errors: httpError.details }),
    };

    res.status(status).type('application/problem+json').json(problem);
  };
}
