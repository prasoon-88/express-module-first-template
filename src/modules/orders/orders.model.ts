export type OrderStatus = 'pending' | 'confirmed' | 'expired';

export interface OrderItem {
  sku: string;
  quantity: number;
}

/**
 * The order as the orders module stores it. Storage-neutral: adapters map this to and from
 * their own representation. It never leaves the module; services return `OrderDto`.
 */
export interface OrderEntity {
  id: string;
  /** Reference to a user. The user itself belongs to the users module. */
  userId: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}
