import { AppError, type AppErrorOptions } from './app-error';

/** An AppError that knows which HTTP status it maps to. Module errors extend the subclasses below. */
export class HttpError extends AppError {
  readonly status: number;

  constructor(status: number, code: string, message: string, options?: AppErrorOptions) {
    super(code, message, options);
    this.status = status;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', code = 'BAD_REQUEST', options?: AppErrorOptions) {
    super(400, code, message, options);
  }
}

export interface ValidationIssue {
  /** Dot path starting with the request part, e.g. `body.email`. */
  path: string;
  message: string;
}

export class ValidationError extends BadRequestError {
  constructor(issues: ValidationIssue[]) {
    super('Request validation failed', 'VALIDATION_ERROR', { details: issues });
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', options?: AppErrorOptions) {
    super(404, code, message, options);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict', code = 'CONFLICT', options?: AppErrorOptions) {
    super(409, code, message, options);
  }
}

export class PayloadTooLargeError extends HttpError {
  constructor(message = 'Request body is too large', code = 'PAYLOAD_TOO_LARGE') {
    super(413, code, message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too many requests, please retry later', code = 'TOO_MANY_REQUESTS') {
    super(429, code, message);
  }
}
