import { ConflictError, NotFoundError } from '@shared/errors';

export class OrderNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Order ${id} not found`, 'ORDER_NOT_FOUND');
  }
}

export class OrderNotPendingError extends ConflictError {
  constructor(id: string, status: string) {
    super(`Order ${id} is ${status}; only a pending order can be confirmed`, 'ORDER_NOT_PENDING');
  }
}
