import { logger } from './logger';

/**
 * Registry of every domain event, keyed by event name.
 * Modules add their events through declaration merging in `<module>.events.ts`:
 *
 *   declare module '@shared/lib/event-bus' {
 *     interface DomainEvents { 'order.placed': OrderPlacedEvent }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled in by the modules
export interface DomainEvents {}

type EventHandler<Payload> = (payload: Payload) => void | Promise<void>;

export interface EventBus<Events extends object = DomainEvents> {
  /** Schedules the handlers and returns immediately. A failing handler never reaches the publisher. */
  publish<Name extends keyof Events & string>(name: Name, payload: Events[Name]): void;
  /** Returns a function that removes the subscription. */
  subscribe<Name extends keyof Events & string>(
    name: Name,
    handler: EventHandler<Events[Name]>,
  ): () => void;
  /** Resolves once every handler scheduled so far has settled. Used by shutdown and tests. */
  drain(): Promise<void>;
}

/**
 * In-process, at-most-once event bus: events live in memory and are lost if the process dies
 * before the handlers run. See ARCHITECTURE.md for the outbox upgrade path.
 */
export function createEventBus<Events extends object = DomainEvents>(): EventBus<Events> {
  const handlers = new Map<string, Set<EventHandler<never>>>();
  const pending = new Set<Promise<void>>();

  async function dispatch(name: string, handler: EventHandler<never>, payload: never) {
    try {
      // Yield first so the publisher's operation completes before any handler runs.
      await Promise.resolve();
      await handler(payload);
    } catch (error) {
      logger.error({ err: error, event: name }, 'Event handler failed');
    }
  }

  return {
    publish(name, payload) {
      for (const handler of handlers.get(name) ?? []) {
        const run = dispatch(name, handler, payload as never);
        pending.add(run);
        void run.finally(() => pending.delete(run));
      }
    },

    subscribe(name, handler) {
      const registered = handlers.get(name) ?? new Set();
      handlers.set(name, registered);
      registered.add(handler);
      return () => {
        registered.delete(handler);
      };
    },

    async drain() {
      while (pending.size > 0) {
        await Promise.all(pending);
      }
    },
  };
}
