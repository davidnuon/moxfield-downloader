import { setTimeout as sleep } from 'node:timers/promises';

export interface RateLimiterOptions {
  concurrency?: number;
  delayMs?: number;
}

export class RateLimiter {
  private concurrency: number;
  private delayMs: number;
  private running = 0;
  private lastRequestTime = 0;
  private queue: Array<() => void> = [];

  constructor(options: RateLimiterOptions = {}) {
    this.concurrency = Math.max(1, options.concurrency ?? 2);
    this.delayMs = Math.max(0, options.delayMs ?? 350);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquireSlot();
    try {
      await this.enforceDelay();
      return await fn();
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
    this.running++;
  }

  private async enforceDelay(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.delayMs) {
      await sleep(this.delayMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private releaseSlot(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}
