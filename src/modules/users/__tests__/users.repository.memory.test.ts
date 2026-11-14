import { createInMemoryUsersRepository } from '../users.repository.memory';
import { describeUsersRepositoryContract } from './users.repository.contract';

describeUsersRepositoryContract('in-memory', createInMemoryUsersRepository);
