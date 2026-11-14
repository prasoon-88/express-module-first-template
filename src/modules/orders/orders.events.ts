/**
 * Events the orders module emits. It consumes none.
 * The declaration below adds them to the shared, typed event registry.
 */
export interface OrderPlacedEvent {
  orderId: string;
  userId: string;
  placedAt: string;
}

declare module '@shared/lib/event-bus' {
  interface DomainEvents {
    'order.placed': OrderPlacedEvent;
  }
}
