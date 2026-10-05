import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MoxfieldClient } from '../api/moxfield-client.js';
import { exportToJson } from '../exporters/json-exporter.js';
import { exportToMtgo } from '../exporters/mtgo-exporter.js';
import { exportToText } from '../exporters/text-exporter.js';
import { DownloaderOptions, DownloadResult, ExportFormat } from '../types/options.js';
import { MoxfieldDeck, MoxfieldDeckSummary } from '../types/moxfield.js';
import { getDeckFileBase, sanitizeFilename } from '../utils/sanitizer.js';
import { ManifestManager } from './manifest-manager.js';

export interface DownloaderEvents {
  onProgress?: (current: number, total: number, deck: MoxfieldDeckSummary, status: 'downloading' | 'skipped' | 'done' | 'failed') => void;
  onMessage?: (message: string) => void;
}

export class MoxfieldDownloader {
  private client: MoxfieldClient;
  private options: DownloaderOptions;
  private events: DownloaderEvents;

  constructor(options: DownloaderOptions, events: DownloaderEvents = {}) {
    this.options = options;
    this.events = events;
    this.client = new MoxfieldClient({
      concurrency: options.concurrency,
      delayMs: options.delayMs,
      token: options.token,
      verbose: options.verbose,
    });
  }

  async run(): Promise<DownloadResult> {
    const result: DownloadResult = {
      totalFound: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    const { username, outputDir, incremental, dryRun } = this.options;

    this.events.onMessage?.(`Searching decks for Moxfield user "${username}"...`);

    // 1. Search all decks
    const summaries = await this.client.searchUserDecks(username, (page, totalPages, count) => {
      this.events.onMessage?.(`Retrieved page ${page}/${totalPages} (${count} decks so far)...`);
    });

    result.totalFound = summaries.length;
    this.events.onMessage?.(`Found ${summaries.length} total deck(s) for user "${username}".`);

    if (summaries.length === 0) {
      return result;
    }

    // 2. Load sync manifest
    const manifest = await ManifestManager.load(outputDir, username);

    // 3. Process each deck
    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      const index = i + 1;

      // Incremental check
      if (incremental && ManifestManager.isDeckUpToDate(manifest, summary)) {
        result.skipped++;
        this.events.onProgress?.(index, summaries.length, summary, 'skipped');
        continue;
      }

      if (dryRun) {
        result.downloaded++;
        this.events.onProgress?.(index, summaries.length, summary, 'done');
        continue;
      }

      this.events.onProgress?.(index, summaries.length, summary, 'downloading');

      try {
        const deckKey = summary.publicId || summary.id;
        const fullDeck = await this.client.getDeck(deckKey);
        const writtenRelativeFiles = await this.saveDeck(fullDeck);

        ManifestManager.recordDeck(manifest, fullDeck, writtenRelativeFiles);
        result.downloaded++;
        this.events.onProgress?.(index, summaries.length, summary, 'done');
      } catch (err: any) {
        result.failed++;
        result.errors.push({
          deckId: summary.id,
          deckName: summary.name,
          error: err.message,
        });
        this.events.onProgress?.(index, summaries.length, summary, 'failed');
      }
    }

    // 4. Save manifest if not in dry-run mode
    if (!dryRun) {
      await ManifestManager.save(outputDir, manifest);
    }

    return result;
  }

  private async saveDeck(deck: MoxfieldDeck): Promise<string[]> {
    const { outputDir, groupBy, flat, formats, includeConsidering } = this.options;

    // Determine target directory
    const formatDirName = groupBy === 'format' ? sanitizeFilename(deck.format || 'other') : '';
    const baseDir = path.join(outputDir, formatDirName);

    const fileBase = getDeckFileBase(deck.name, deck.id);
    const targetDir = flat ? baseDir : path.join(baseDir, fileBase);

    await fs.mkdir(targetDir, { recursive: true });

    const writtenRelativeFiles: string[] = [];

    for (const format of formats) {
      const { filename, content } = this.generateExport(deck, format, fileBase, flat, includeConsidering);
      const filePath = path.join(targetDir, filename);

      await fs.writeFile(filePath, content, 'utf8');

      const relPath = path.relative(outputDir, filePath);
      writtenRelativeFiles.push(relPath);
    }

    return writtenRelativeFiles;
  }

  private generateExport(
    deck: MoxfieldDeck,
    format: ExportFormat,
    fileBase: string,
    flat: boolean,
    includeConsidering: boolean
  ): { filename: string; content: string } {
    switch (format) {
      case 'json': {
        const filename = flat ? `${fileBase}.json` : 'deck.json';
        return { filename, content: exportToJson(deck) };
      }
      case 'text':
      case 'arena': {
        const filename = flat ? `${fileBase}.txt` : 'deck.txt';
        return {
          filename,
          content: exportToText(deck, { includeConsidering, detailed: true }),
        };
      }
      case 'mtgo': {
        const filename = flat ? `${fileBase}.mtgo.txt` : 'deck.mtgo.txt';
        return { filename, content: exportToMtgo(deck) };
      }
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
}
