import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from '../scheduler';

describe('scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a job on every interval', async () => {
    const run = vi.fn(() => Promise.resolve());
    const scheduler = createScheduler([{ name: 'job', intervalMs: 1000, run }]);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(3000);

    expect(run).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });

  it('never overlaps a job with itself', async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const scheduler = createScheduler([{ name: 'slow', intervalMs: 1000, run }]);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);

    finish();
    await scheduler.stop();
  });

  it('keeps running a job after it fails', async () => {
    const run = vi.fn(() => Promise.reject(new Error('boom')));
    const scheduler = createScheduler([{ name: 'flaky', intervalMs: 1000, run }]);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(2000);

    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('stop cancels future runs and waits for the run in flight', async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const scheduler = createScheduler([{ name: 'slow', intervalMs: 1000, run }]);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1000);

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(stopped).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await stopping;
    expect(stopped).toBe(true);
  });
});
