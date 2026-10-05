import { RateLimiter } from '../utils/rate-limiter.js';
import { httpGetJson } from '../utils/http.js';
import {
  MoxfieldDeck,
  MoxfieldDeckSchema,
  MoxfieldDeckSummary,
  MoxfieldSearchResponseSchema,
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
   * Enumerate all decks created by a specified user.
   * Handles pagination automatically until all decks are retrieved.
   */
  async searchUserDecks(
    username: string,
    onPage?: (page: number, totalPages: number, currentCount: number) => void
  ): Promise<MoxfieldDeckSummary[]> {
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
      allSummaries.push(...data);

      if (onPage) {
        onPage(page, totalPages, allSummaries.length);
      }

      if (data.length === 0 || allSummaries.length >= totalResults) {
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
