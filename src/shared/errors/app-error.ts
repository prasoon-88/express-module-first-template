export interface AppErrorOptions {
  /** The underlying error, kept for logs and never sent to clients. */
  cause?: unknown;
  /** Machine-readable details that are safe to send to clients. */
  details?: unknown;
}

/** Base class for every error the application raises on purpose. */
export class AppError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.details = options.details;
  }
}
