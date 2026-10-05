import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const exec = promisify(execFile);

export interface HttpOptions {
  headers?: Record<string, string>;
  retries?: number;
  backoffMs?: number;
  verbose?: boolean;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Execute HTTP GET via curl to bypass Cloudflare TLS fingerprint blocks (JA3/JA4).
 * Falls back to native fetch if curl is unavailable.
 */
async function curlGetJson(url: string, headers: Record<string, string>): Promise<any> {
  const curlArgs = [
    '-s',
    '--fail-with-body',
    '-H', `User-Agent: ${headers['User-Agent'] || DEFAULT_USER_AGENT}`,
    '-H', `Referer: ${headers['Referer'] || 'https://www.moxfield.com/'}`,
    '-H', `Origin: ${headers['Origin'] || 'https://www.moxfield.com'}`,
    '-H', `Accept: ${headers['Accept'] || 'application/json'}`,
  ];

  if (headers['Authorization']) {
    curlArgs.push('-H', `Authorization: ${headers['Authorization']}`);
  }

  curlArgs.push(url);

  const { stdout } = await exec('curl', curlArgs, { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

/**
 * Robust JSON fetch with automatic curl fallback, retry, and backoff.
 */
export async function httpGetJson<T = any>(
  url: string,
  options: HttpOptions = {}
): Promise<T> {
  const { retries = 3, backoffMs = 1000, verbose = false, headers = {} } = options;

  const mergedHeaders: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    Referer: 'https://www.moxfield.com/',
    Origin: 'https://www.moxfield.com',
    Accept: 'application/json',
    ...headers,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Primary: Use curl to seamlessly navigate Cloudflare bot mitigations
      return await curlGetJson(url, mergedHeaders);
    } catch (curlErr: any) {
      if (verbose) {
        console.warn(`[curl transport error on attempt ${attempt}]: ${curlErr.message}`);
      }

      // Secondary: Try native fetch as fallback
      try {
        const response = await fetch(url, { headers: mergedHeaders });
        if (response.ok) {
          return (await response.json()) as T;
        }

        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('Retry-After')) || attempt * 2;
          await sleep(retryAfter * 1000);
          continue;
        }
      } catch (fetchErr: any) {
        if (verbose) {
          console.warn(`[fetch fallback error on attempt ${attempt}]: ${fetchErr.message}`);
        }
      }

      if (attempt === retries) {
        throw new Error(`Failed to fetch ${url} after ${retries} attempts: ${curlErr.message}`);
      }

      const waitMs = backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
      await sleep(waitMs);
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}
