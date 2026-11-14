import { ConflictError, NotFoundError } from '@shared/errors';

export class UserNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`User ${id} not found`, 'USER_NOT_FOUND');
  }
}

export class EmailAlreadyInUseError extends ConflictError {
  constructor(email: string) {
    super(`Email ${email} is already in use`, 'EMAIL_ALREADY_IN_USE');
  }
}
