import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { EmailAlreadyInUseError, UserNotFoundError } from '../users.errors';
import { createInMemoryUsersRepository } from '../users.repository.memory';
import { createUsersService, type UsersService } from '../users.service';

describe('users service', () => {
  let service: UsersService;

  beforeEach(() => {
    service = createUsersService({ repository: createInMemoryUsersRepository() });
  });

  it('creates a user and returns a DTO, not the stored entity', async () => {
    const user = await service.createUser({ email: 'ada@example.com', name: 'Ada' });

    expect(user).toEqual({
      id: expect.any(String) as string,
      email: 'ada@example.com',
      name: 'Ada',
      orderCount: 0,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });
    expect(new Date(user.createdAt).toISOString()).toBe(user.createdAt);
  });

  it('rejects a duplicate email', async () => {
    await service.createUser({ email: 'ada@example.com', name: 'Ada' });

    await expect(service.createUser({ email: 'ada@example.com', name: 'Other' })).rejects.toThrow(
      EmailAlreadyInUseError,
    );
  });

  it('gets a user by id', async () => {
    const created = await service.createUser({ email: 'ada@example.com', name: 'Ada' });

    await expect(service.getUserById(created.id)).resolves.toEqual(created);
  });

  it('throws UserNotFoundError for an unknown id', async () => {
    await expect(service.getUserById(randomUUID())).rejects.toThrow(UserNotFoundError);
  });

  it('lists users one page at a time', async () => {
    for (const name of ['a', 'b', 'c']) {
      await service.createUser({ email: `${name}@example.com`, name });
    }

    const page = await service.listUsers({ page: 2, pageSize: 2 });

    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(page.items).toHaveLength(1);
  });

  it('counts an order placed by the user', async () => {
    const user = await service.createUser({ email: 'ada@example.com', name: 'Ada' });

    await service.recordOrderPlaced(user.id);

    await expect(service.getUserById(user.id)).resolves.toMatchObject({ orderCount: 1 });
  });

  it('fails to count an order for an unknown user', async () => {
    await expect(service.recordOrderPlaced(randomUUID())).rejects.toThrow(UserNotFoundError);
  });
});
