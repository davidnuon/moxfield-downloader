export type ExportFormat = 'json' | 'text' | 'arena' | 'mtgo';

export type GroupByStrategy = 'format' | 'none';

export interface DownloaderOptions {
  username: string;
  outputDir: string;
  formats: ExportFormat[];
  groupBy: GroupByStrategy;
  flat: boolean;
  includeConsidering: boolean;
  incremental: boolean;
  concurrency: number;
  delayMs: number;
  token?: string;
  dryRun: boolean;
  verbose: boolean;
}

export interface DownloadResult {
  totalFound: number;
  downloaded: number;
  skipped: number;
  failed: number;
  errors: Array<{ deckId: string; deckName: string; error: string }>;
}
