import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const exec = promisify(execFile);

export class HttpError extends Error {
  status: number;
  body?: string;

  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export interface HttpOptions {
  headers?: Record<string, string>;
  retries?: number;
  backoffMs?: number;
  verbose?: boolean;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function curlGetRaw(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  const curlArgs = [
    '-s',
    '-w',
    '\n%{http_code}',
    '-H',
    `User-Agent: ${headers['User-Agent'] || DEFAULT_USER_AGENT}`,
    '-H',
    `Referer: ${headers['Referer'] || 'https://www.moxfield.com/'}`,
    '-H',
    `Origin: ${headers['Origin'] || 'https://www.moxfield.com'}`,
    '-H',
    `Accept: ${headers['Accept'] || 'application/json'}`,
  ];

  if (headers['Authorization']) {
    curlArgs.push('-H', `Authorization: ${headers['Authorization']}`);
  }

  curlArgs.push(url);

  const { stdout } = await exec('curl', curlArgs, { maxBuffer: 10 * 1024 * 1024 });
  const lastNewline = stdout.lastIndexOf('\n');
  const body = stdout.slice(0, lastNewline);
  const status = parseInt(stdout.slice(lastNewline + 1).trim(), 10);

  return { status, body };
}

/**
 * Robust JSON fetch with automatic curl transport, accurate status codes, and backoff.
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
      const { status, body } = await curlGetRaw(url, mergedHeaders);

      if (status === 404) {
        throw new HttpError(404, `HTTP 404 Not Found from ${url}`, body);
      }

      if (status === 401 || status === 403) {
        throw new HttpError(status, `HTTP ${status} Forbidden/Unauthorized from ${url}`, body);
      }

      if (status === 429) {
        if (attempt === retries) {
          throw new HttpError(429, `HTTP 429 Rate limited on ${url}`, body);
        }
        const waitMs = backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
        if (verbose) {
          console.warn(`[HTTP 429] Rate limited on ${url}. Retrying in ${Math.round(waitMs)}ms...`);
        }
        await sleep(waitMs);
        continue;
      }

      if (status >= 500) {
        if (attempt === retries) {
          throw new HttpError(status, `HTTP ${status} Server Error from ${url}`, body);
        }
        const waitMs = backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
        await sleep(waitMs);
        continue;
      }

      if (status >= 200 && status < 300) {
        return JSON.parse(body) as T;
      }

      throw new HttpError(status, `HTTP ${status} from ${url}`, body);
    } catch (err: any) {
      if (err instanceof HttpError) {
        // Non-transient errors (404, 401, 403) rethrow immediately without retrying
        if (err.status === 404 || err.status === 401 || err.status === 403) {
          throw err;
        }
      }

      if (attempt === retries) {
        throw err;
      }

      const waitMs = backoffMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
      if (verbose) {
        console.warn(`Fetch error on ${url}: ${err.message}. Retrying in ${Math.round(waitMs)}ms...`);
      }
      await sleep(waitMs);
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}
