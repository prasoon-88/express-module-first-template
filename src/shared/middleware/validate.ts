import type { Request, RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError, type ValidationIssue } from '@shared/errors';

type DefaultParams = Request['params'];
type DefaultQuery = Request['query'];

export interface RequestSchemas<Params, Body, Query> {
  params?: z.ZodType<Params>;
  body?: z.ZodType<Body>;
  query?: z.ZodType<Query>;
}

/**
 * A handler whose `req.params`, `req.body` and `req.query` have been parsed by `validate`.
 * Controllers use the same type arguments as the schemas on their route, so a route whose
 * schemas do not match its controller fails to compile.
 */
export type ValidatedHandler<
  Params = DefaultParams,
  Body = unknown,
  Query = DefaultQuery,
> = RequestHandler<Params, unknown, Body, Query>;

function parsePart<T>(
  part: 'params' | 'body' | 'query',
  schema: z.ZodType<T>,
  value: unknown,
  issues: ValidationIssue[],
): T | undefined {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  for (const issue of result.error.issues) {
    issues.push({ path: [part, ...issue.path.map(String)].join('.'), message: issue.message });
  }
  return undefined;
}

/**
 * Validates the given request parts and replaces them with the parsed (coerced, defaulted,
 * stripped) values. Every problem is reported at once through a single ValidationError.
 */
export function validate<Params = DefaultParams, Body = unknown, Query = DefaultQuery>(
  schemas: RequestSchemas<Params, Body, Query>,
): ValidatedHandler<Params, Body, Query> {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];
    const params = schemas.params && parsePart('params', schemas.params, req.params, issues);
    const body = schemas.body && parsePart('body', schemas.body, req.body, issues);
    const query = schemas.query && parsePart('query', schemas.query, req.query, issues);

    if (issues.length > 0) {
      throw new ValidationError(issues);
    }

    if (params !== undefined) {
      req.params = params;
    }
    if (body !== undefined) {
      req.body = body;
    }
    if (query !== undefined) {
      // Express 5 exposes `req.query` as a getter on the prototype, so it cannot be assigned.
      // Defining an own property shadows the getter for this request only.
      Object.defineProperty(req, 'query', {
        value: query,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  };
}
