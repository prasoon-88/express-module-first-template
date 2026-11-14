import { z } from 'zod';
import { paginationQuerySchema } from '@shared/utils/pagination';

export const createUserBodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  name: z.string().trim().min(1).max(100),
});

export const userIdParamsSchema = z.object({
  id: z.uuid(),
});

export const listUsersQuerySchema = paginationQuerySchema;

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UserIdParams = z.infer<typeof userIdParamsSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
