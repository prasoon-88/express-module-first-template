import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { EmailAlreadyInUseError } from '../users.errors';
import type { UserEntity } from '../users.model';
import type { UsersRepository } from '../users.repository';

function buildUser(overrides: Partial<UserEntity> = {}): UserEntity {
  const id = overrides.id ?? randomUUID();
  const createdAt = overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    email: `${id}@example.com`,
    name: 'Ada Lovelace',
    orderCount: 0,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

/**
 * The behaviour every UsersRepository adapter must have. Run it against each adapter:
 *
 *   describeUsersRepositoryContract('postgres', () => createPostgresUsersRepository(testPool));
 *
 * `createRepository` must return an empty repository on every call.
 */
export function describeUsersRepositoryContract(
  adapterName: string,
  createRepository: () => UsersRepository | Promise<UsersRepository>,
): void {
  describe(`UsersRepository contract: ${adapterName}`, () => {
    let repository: UsersRepository;

    beforeEach(async () => {
      repository = await createRepository();
    });

    it('finds an inserted user by id', async () => {
      const user = buildUser();
      await repository.insert(user);

      await expect(repository.findById(user.id)).resolves.toEqual(user);
    });

    it('resolves to null for an unknown id', async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });

    it('rejects a second user with the same email', async () => {
      await repository.insert(buildUser({ email: 'ada@example.com' }));

      await expect(repository.insert(buildUser({ email: 'ada@example.com' }))).rejects.toThrow(
        EmailAlreadyInUseError,
      );
      await expect(repository.list({ offset: 0, limit: 10 })).resolves.toMatchObject({ total: 1 });
    });

    it('does not share state with the objects it receives or returns', async () => {
      const user = buildUser({ name: 'Original' });
      await repository.insert(user);
      user.name = 'Mutated after insert';

      const found = await repository.findById(user.id);
      expect(found?.name).toBe('Original');

      if (found) {
        found.name = 'Mutated after read';
      }
      await expect(repository.findById(user.id)).resolves.toMatchObject({ name: 'Original' });
    });

    it('lists by creation time with offset, limit and the overall total', async () => {
      const third = buildUser({ createdAt: new Date('2026-01-03T00:00:00.000Z') });
      const first = buildUser({ createdAt: new Date('2026-01-01T00:00:00.000Z') });
      const second = buildUser({ createdAt: new Date('2026-01-02T00:00:00.000Z') });
      await repository.insert(third);
      await repository.insert(first);
      await repository.insert(second);

      const firstPage = await repository.list({ offset: 0, limit: 2 });
      const secondPage = await repository.list({ offset: 2, limit: 2 });

      expect(firstPage.items.map(({ id }) => id)).toEqual([first.id, second.id]);
      expect(secondPage.items.map(({ id }) => id)).toEqual([third.id]);
      expect(firstPage.total).toBe(3);
      expect(secondPage.total).toBe(3);
    });

    it('increments the order count and touches updatedAt', async () => {
      const user = buildUser();
      const at = new Date('2026-02-01T00:00:00.000Z');
      await repository.insert(user);

      await expect(repository.incrementOrderCount(user.id, at)).resolves.toBe(true);
      await expect(repository.incrementOrderCount(user.id, at)).resolves.toBe(true);

      await expect(repository.findById(user.id)).resolves.toMatchObject({
        orderCount: 2,
        updatedAt: at,
      });
    });

    it('reports false when incrementing the order count of an unknown user', async () => {
      await expect(repository.incrementOrderCount(randomUUID(), new Date())).resolves.toBe(false);
    });
  });
}
