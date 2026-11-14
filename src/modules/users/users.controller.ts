import type { ValidatedHandler } from '@shared/middleware/validate';
import type { CreateUserBody, ListUsersQuery, UserIdParams } from './users.schema';
import type { UsersService } from './users.service';

export interface UsersController {
  create: ValidatedHandler<{ body: CreateUserBody }>;
  getById: ValidatedHandler<{ params: UserIdParams }>;
  list: ValidatedHandler<{ query: ListUsersQuery }>;
}

/** Translates HTTP to service calls and back. No business logic. */
export function createUsersController(service: UsersService): UsersController {
  return {
    async create(req, res) {
      const user = await service.createUser(req.body);
      res.status(201).location(`${req.baseUrl}/${user.id}`).json(user);
    },

    async getById(req, res) {
      res.json(await service.getUserById(req.params.id));
    },

    async list(req, res) {
      res.json(await service.listUsers(req.query));
    },
  };
}
