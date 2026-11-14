import { EmailAlreadyInUseError } from './users.errors';
import type { UserEntity } from './users.model';
import type { UsersRepository } from './users.repository';

/**
 * In-memory adapter: data lives in this process and is lost on restart.
 * Entities are cloned on the way in and out, as a real database would, so callers can never
 * change stored state by mutating an object they hold.
 */
export function createInMemoryUsersRepository(): UsersRepository {
  const users = new Map<string, UserEntity>();

  return {
    async insert(user) {
      for (const existing of users.values()) {
        if (existing.email === user.email) {
          throw new EmailAlreadyInUseError(user.email);
        }
      }
      users.set(user.id, structuredClone(user));
    },

    async findById(id) {
      const user = users.get(id);
      return user ? structuredClone(user) : null;
    },

    async list({ offset, limit }) {
      const sorted = [...users.values()].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
      );
      return {
        items: sorted.slice(offset, offset + limit).map((user) => structuredClone(user)),
        total: sorted.length,
      };
    },

    async incrementOrderCount(id, at) {
      const user = users.get(id);
      if (!user) {
        return false;
      }
      user.orderCount += 1;
      user.updatedAt = new Date(at);
      return true;
    },
  };
}
