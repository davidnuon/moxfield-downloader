---
name: nodejs-engineering
description: Use when building, testing, profiling, or refactoring Node.js and TypeScript applications, handling streams and async concurrency, or designing rate-limited API clients.
---

# Node.js & TypeScript Engineering Guide

## Essential Practices

### 1. Resilient HTTP Requests with Rate Limiting & Exponential Backoff
When querying rate-limited APIs (e.g. Scryfall / Moxfield):
```typescript
import { setTimeout as sleep } from 'node:timers/promises';

interface FetchWithRetryOptions extends RequestInit {
  retries?: number;
  backoffMs?: number;
  rateLimitDelayMs?: number;
}

export async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const { retries = 3, backoffMs = 1000, rateLimitDelayMs = 100, ...init } = options;

  if (rateLimitDelayMs > 0) {
    await sleep(rateLimitDelayMs);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'User-Agent': 'MoxfieldDownloader/1.0',
          ...init.headers,
        },
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After')) || (attempt * 2);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok && response.status >= 500 && attempt < retries) {
        await sleep(backoffMs * Math.pow(2, attempt - 1));
        continue;
      }

      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(backoffMs * Math.pow(2, attempt - 1));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}
```

### 2. Stream Pipelines for Bulk Downloads
Always use `stream/promises` to properly handle memory backpressure and errors:
```typescript
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetchWithRetry(url);
  if (!res.body) throw new Error(`Empty response body from ${url}`);
  const nodeReadable = Readable.fromWeb(res.body as any);
  await pipeline(nodeReadable, createWriteStream(destPath));
}
```

### 3. TypeScript Config Baseline (`tsconfig.json`)
Target ESM with strict checks:
- `"module": "NodeNext"`
- `"moduleResolution": "NodeNext"`
- `"strict": true`
- `"skipLibCheck": true`
