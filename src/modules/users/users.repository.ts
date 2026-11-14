import type { UserEntity } from './users.model';

export interface ListUsersParams {
  offset: number;
  limit: number;
}

export interface UsersPage {
  items: UserEntity[];
  total: number;
}

/**
 * Persistence port of the users module: the only persistence contract the service sees.
 * Every adapter (`users.repository.<driver>.ts`) must pass the contract suite in
 * `__tests__/users.repository.contract.ts`.
 */
export interface UsersRepository {
  /**
   * Stores a new user. Email uniqueness is enforced here, atomically: rejects with
   * `EmailAlreadyInUseError` when the email is taken (adapters map their unique-index violation).
   */
  insert(user: UserEntity): Promise<void>;
  findById(id: string): Promise<UserEntity | null>;
  /** Ordered by `createdAt` ascending, then `id`. */
  list(params: ListUsersParams): Promise<UsersPage>;
  /** Atomically adds one to `orderCount`. Resolves to false when the user does not exist. */
  incrementOrderCount(id: string, at: Date): Promise<boolean>;
}
