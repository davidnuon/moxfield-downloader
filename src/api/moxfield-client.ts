import { RateLimiter } from '../utils/rate-limiter.js';
import { HttpError, httpGetJson } from '../utils/http.js';
import {
  MoxfieldDeck,
  MoxfieldDeckSchema,
  MoxfieldDeckSummary,
  MoxfieldSearchResponseSchema,
  MoxfieldUser,
  MoxfieldUserSchema,
} from '../types/moxfield.js';

export interface MoxfieldClientConfig {
  baseUrl?: string;
  concurrency?: number;
  delayMs?: number;
  token?: string;
  userAgent?: string;
  verbose?: boolean;
}

export class MoxfieldClient {
  private baseUrl: string;
  private token?: string;
  private userAgent?: string;
  private verbose: boolean;
  private rateLimiter: RateLimiter;

  constructor(config: MoxfieldClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'https://api2.moxfield.com';
    this.token = config.token;
    this.userAgent = config.userAgent;
    this.verbose = config.verbose ?? false;
    this.rateLimiter = new RateLimiter({
      concurrency: config.concurrency ?? 2,
      delayMs: config.delayMs ?? 350,
    });
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Referer: 'https://www.moxfield.com/',
      Origin: 'https://www.moxfield.com',
      Accept: 'application/json',
    };
    if (this.userAgent) {
      headers['User-Agent'] = this.userAgent;
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Fetch a user profile by username.
   * Returns null if the user does not exist (HTTP 404).
   */
  async getUser(username: string): Promise<MoxfieldUser | null> {
    const url = new URL(`/v1/users/${encodeURIComponent(username)}`, this.baseUrl);
    try {
      const rawJson = await this.rateLimiter.execute(async () => {
        return await httpGetJson(url.toString(), {
          headers: this.getHeaders(),
          verbose: this.verbose,
        });
      });
      const parsed = MoxfieldUserSchema.safeParse(rawJson);
      return parsed.success ? parsed.data : (rawJson as MoxfieldUser);
    } catch (err: any) {
      if (err instanceof HttpError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Enumerate all decks created by a specified user.
   * Handles pagination automatically until all decks are retrieved.
   */
  async searchUserDecks(
    username: string,
    onPage?: (page: number, totalPages: number, currentCount: number) => void
  ): Promise<MoxfieldDeckSummary[]> {
    // Stop immediately if user does not exist (HTTP 404)
    const user = await this.getUser(username);
    if (!user) {
      throw new Error(
        `User "${username}" was not found on Moxfield (HTTP 404). Please verify the username.`
      );
    }

    const allSummaries: MoxfieldDeckSummary[] = [];
    let page = 1;
    let totalPages = 1;
    const pageSize = 64;

    do {
      const url = new URL('/v2/decks/search', this.baseUrl);
      url.searchParams.set('pageNumber', page.toString());
      url.searchParams.set('pageSize', pageSize.toString());
      url.searchParams.set('authorUserNames', username);
      url.searchParams.set('sortType', 'updated');
      url.searchParams.set('sortDirection', 'descending');
      url.searchParams.set('showIllegal', 'true');

      if (this.verbose) {
        console.log(`[MoxfieldClient] Fetching user decks: page ${page}...`);
      }

      const rawJson = await this.rateLimiter.execute(async () => {
        return await httpGetJson(url.toString(), {
          headers: this.getHeaders(),
          verbose: this.verbose,
        });
      });

      const parsed = MoxfieldSearchResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        throw new Error(
          `Unexpected search response structure from Moxfield: ${parsed.error.message}`
        );
      }

      const { data, totalPages: pages, totalResults } = parsed.data;
      totalPages = pages;

      // Guard: Moxfield silently ignores unknown/non-existent usernames in search,
      // falling back to returning all public decks across the entire site.
      const matchingData = data.filter((d) => {
        const author = d.createdByUser?.userName;
        return author && author.toLowerCase() === username.toLowerCase();
      });

      if (data.length > 0 && matchingData.length === 0 && page === 1) {
        if (this.verbose) {
          console.warn(
            `[MoxfieldClient] Author filter was ignored by Moxfield for "${username}". User may not exist or has no public decks.`
          );
        }
        break;
      }

      allSummaries.push(...matchingData);

      if (onPage) {
        onPage(page, totalPages, allSummaries.length);
      }

      if (data.length === 0 || matchingData.length === 0 || allSummaries.length >= totalResults) {
        break;
      }

      page++;
    } while (page <= totalPages);

    return allSummaries;
  }

  /**
   * Fetches the complete deck object for a given deck ID.
   */
  async getDeck(deckId: string): Promise<MoxfieldDeck> {
    const url = new URL(`/v2/decks/all/${encodeURIComponent(deckId)}`, this.baseUrl);

    if (this.verbose) {
      console.log(`[MoxfieldClient] Fetching deck ${deckId}...`);
    }

    const rawJson = await this.rateLimiter.execute(async () => {
      return await httpGetJson(url.toString(), {
        headers: this.getHeaders(),
        verbose: this.verbose,
      });
    });

    const parsed = MoxfieldDeckSchema.safeParse(rawJson);
    if (!parsed.success) {
      if (this.verbose) {
        console.warn(
          `[MoxfieldClient] Deck ${deckId} schema validation warning: ${parsed.error.message}`
        );
      }
      return rawJson as MoxfieldDeck;
    }

    return parsed.data;
  }
}
