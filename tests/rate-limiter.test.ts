import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  it('enforces maximum concurrency', async () => {
    const limiter = new RateLimiter({ concurrency: 2, delayMs: 10 });
    let active = 0;
    let maxObserved = 0;

    const task = async () => {
      return limiter.execute(async () => {
        active++;
        maxObserved = Math.max(maxObserved, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
      });
    };

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('enforces minimum inter-request delay', async () => {
    const limiter = new RateLimiter({ concurrency: 1, delayMs: 40 });
    const timestamps: number[] = [];

    const task = () =>
      limiter.execute(async () => {
        timestamps.push(Date.now());
      });

    await Promise.all([task(), task(), task()]);

    for (let i = 1; i < timestamps.length; i++) {
      const diff = timestamps[i] - timestamps[i - 1];
      // Should be at least around 35ms (accounting for timer variance)
      expect(diff).toBeGreaterThanOrEqual(30);
    }
  });
});
