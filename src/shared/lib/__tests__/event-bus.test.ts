import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../event-bus';

interface TestEvents {
  'thing.happened': { id: string };
  'other.happened': { count: number };
}

describe('event bus', () => {
  it('delivers a published event to every subscriber of that event only', async () => {
    const bus = createEventBus<TestEvents>();
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();
    bus.subscribe('thing.happened', first);
    bus.subscribe('thing.happened', second);
    bus.subscribe('other.happened', other);

    bus.publish('thing.happened', { id: 'a' });
    await bus.drain();

    expect(first).toHaveBeenCalledExactlyOnceWith({ id: 'a' });
    expect(second).toHaveBeenCalledExactlyOnceWith({ id: 'a' });
    expect(other).not.toHaveBeenCalled();
  });

  it('dispatches asynchronously, after the publisher continues', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    bus.subscribe('thing.happened', handler);

    bus.publish('thing.happened', { id: 'a' });

    expect(handler).not.toHaveBeenCalled();
    await bus.drain();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('isolates a failing handler from the publisher and from other handlers', async () => {
    const bus = createEventBus<TestEvents>();
    const healthy = vi.fn();
    bus.subscribe('thing.happened', () => {
      throw new Error('sync failure');
    });
    bus.subscribe('thing.happened', () => Promise.reject(new Error('async failure')));
    bus.subscribe('thing.happened', healthy);

    expect(() => {
      bus.publish('thing.happened', { id: 'a' });
    }).not.toThrow();
    await expect(bus.drain()).resolves.toBeUndefined();

    expect(healthy).toHaveBeenCalledOnce();
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = createEventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('thing.happened', handler);

    unsubscribe();
    bus.publish('thing.happened', { id: 'a' });
    await bus.drain();

    expect(handler).not.toHaveBeenCalled();
  });

  it('drain waits for events published by handlers', async () => {
    const bus = createEventBus<TestEvents>();
    const chained = vi.fn();
    bus.subscribe('thing.happened', () => {
      bus.publish('other.happened', { count: 1 });
    });
    bus.subscribe('other.happened', chained);

    bus.publish('thing.happened', { id: 'a' });
    await bus.drain();

    expect(chained).toHaveBeenCalledExactlyOnceWith({ count: 1 });
  });
});
