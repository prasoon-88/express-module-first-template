import type { EventBus } from '@shared/lib/event-bus';
import type { UsersService } from './users.service';

/**
 * Events the users module reacts to. It emits none.
 *
 * `order.placed` is declared by the orders module (orders.events.ts) on the shared
 * `DomainEvents` registry. Subscribing by name keeps users free of any import from orders.
 */
export function registerUsersEventHandlers(
  eventBus: EventBus,
  service: Pick<UsersService, 'recordOrderPlaced'>,
): void {
  eventBus.subscribe('order.placed', async (event) => {
    await service.recordOrderPlaced(event.userId);
  });
}
