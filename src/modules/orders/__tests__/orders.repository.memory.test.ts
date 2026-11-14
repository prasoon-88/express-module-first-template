import { createInMemoryOrdersRepository } from '../orders.repository.memory';
import { describeOrdersRepositoryContract } from './orders.repository.contract';

describeOrdersRepositoryContract('in-memory', createInMemoryOrdersRepository);
