export interface UserDto {
  id: string;
  email: string;
  name: string;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
}

/** What other modules may call. Exposed through `createUsersModule(...).api`. */
export interface UsersApi {
  /** Rejects with `UserNotFoundError` when the user does not exist. */
  getUserById(id: string): Promise<UserDto>;
}
