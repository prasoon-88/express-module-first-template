/**
 * The user as the users module stores it. Storage-neutral: adapters map this to and from their
 * own representation (document, row). It never leaves the module; services return `UserDto`.
 */
export interface UserEntity {
  id: string;
  email: string;
  name: string;
  orderCount: number;
  createdAt: Date;
  updatedAt: Date;
}
