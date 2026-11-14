import { randomUUID } from 'node:crypto';
import type { Page } from '@shared/types/pagination';
import { toOffset, toPage, type PaginationQuery } from '@shared/utils/pagination';
import { UserNotFoundError } from './users.errors';
import type { UserEntity } from './users.model';
import type { UsersRepository } from './users.repository';
import type { CreateUserInput, UserDto } from './users.types';

export interface UsersService {
  createUser(input: CreateUserInput): Promise<UserDto>;
  getUserById(id: string): Promise<UserDto>;
  listUsers(query: PaginationQuery): Promise<Page<UserDto>>;
  recordOrderPlaced(userId: string): Promise<void>;
}

export interface UsersServiceDeps {
  repository: UsersRepository;
}

/** Entities stay inside the module; everything that leaves the service is a DTO. */
function toUserDto(user: UserEntity): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    orderCount: user.orderCount,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function createUsersService({ repository }: UsersServiceDeps): UsersService {
  return {
    async createUser(input) {
      const now = new Date();
      const user: UserEntity = {
        id: randomUUID(),
        email: input.email,
        name: input.name,
        orderCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await repository.insert(user);
      return toUserDto(user);
    },

    async getUserById(id) {
      const user = await repository.findById(id);
      if (!user) {
        throw new UserNotFoundError(id);
      }
      return toUserDto(user);
    },

    async listUsers(query) {
      const { items, total } = await repository.list(toOffset(query));
      return toPage(items.map(toUserDto), total, query);
    },

    async recordOrderPlaced(userId) {
      const updated = await repository.incrementOrderCount(userId, new Date());
      if (!updated) {
        throw new UserNotFoundError(userId);
      }
    },
  };
}
