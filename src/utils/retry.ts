import { setTimeout as sleep } from 'node:timers/promises';

export interface RetryOptions extends RequestInit {
  retries?: number;
  backoffMs?: number;
  verbose?: boolean;
}

export async function fetchWithRetry(
  url: string,
  options: RetryOptions = {}
): Promise<Response> {
  const { retries = 3, backoffMs = 1000, verbose = false, ...init } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retrySec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const waitMs = Number.isFinite(retrySec)
          ? retrySec * 1000
          : backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);

        if (verbose) {
          console.warn(`[HTTP 429] Rate limited on ${url}. Retrying in ${Math.round(waitMs)}ms (attempt ${attempt}/${retries})...`);
        }

        if (attempt === retries) {
          throw new Error(`HTTP 429 Too Many Requests from ${url} (max retries reached)`);
        }

        await sleep(waitMs);
        continue;
      }

      if (!response.ok && response.status >= 500) {
        const waitMs = backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
        if (verbose) {
          console.warn(`[HTTP ${response.status}] Server error on ${url}. Retrying in ${Math.round(waitMs)}ms (attempt ${attempt}/${retries})...`);
        }

        if (attempt === retries) {
          throw new Error(`HTTP ${response.status} ${response.statusText} from ${url} (max retries reached)`);
        }

        await sleep(waitMs);
        continue;
      }

      return response;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err;
      }

      if (attempt === retries) {
        throw err;
      }

      const waitMs = backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
      if (verbose) {
        console.warn(`Network error on ${url}: ${err.message}. Retrying in ${Math.round(waitMs)}ms (attempt ${attempt}/${retries})...`);
      }
      await sleep(waitMs);
    }
  }

  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}
