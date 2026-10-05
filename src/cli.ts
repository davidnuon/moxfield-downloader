import { Command } from 'commander';
import path from 'node:path';
import { MoxfieldDownloader } from './sync/downloader.js';
import { GitHistoryBuilder } from './history/git-history-builder.js';
import { DownloaderOptions, ExportFormat, GroupByStrategy } from './types/options.js';

function parseFormats(formatStr: string): ExportFormat[] {
  const allowed: ExportFormat[] = ['json', 'text', 'arena', 'mtgo'];
  const requested = formatStr.split(',').map((f) => f.trim().toLowerCase());

  const validFormats: ExportFormat[] = [];
  for (const f of requested) {
    if (allowed.includes(f as ExportFormat)) {
      if (!validFormats.includes(f as ExportFormat)) {
        validFormats.push(f as ExportFormat);
      }
    } else {
      console.warn(`[Warning] Ignoring unknown format "${f}". Allowed: ${allowed.join(', ')}`);
    }
  }

  return validFormats.length > 0 ? validFormats : ['text', 'json'];
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('moxfield-downloader')
    .description('CLI tool to download and archive all decks from a Moxfield user account')
    .version('0.1.0');

  program
    .command('download')
    .description('Download all decks for a specified Moxfield username')
    .argument('<username>', 'Moxfield username')
    .option('-o, --output <dir>', 'Destination directory for decks', './decks')
    .option(
      '-f, --format <formats>',
      'Comma-separated export formats (json, text, arena, mtgo)',
      'text,json'
    )
    .option(
      '--group-by <strategy>',
      'Folder grouping strategy: "format" or "none"',
      'format'
    )
    .option('--flat', 'Output files directly without creating subdirectories per deck', false)
    .option('--no-considering', 'Exclude considering / maybeboard cards')
    .option('--no-incremental', 'Re-download all decks, ignoring the sync manifest')
    .option('--concurrency <n>', 'Maximum parallel HTTP requests (default: 2)', '2')
    .option('--delay <ms>', 'Delay between sequential requests in milliseconds', '350')
    .option('--token <token>', 'Optional Moxfield session/Bearer token for private decks')
    .option('--dry-run', 'Preview decks to download without saving files', false)
    .option('-v, --verbose', 'Enable verbose logging', false)
    .action(async (username: string, rawOptions: any) => {
      const outputDir = path.resolve(process.cwd(), rawOptions.output);
      const formats = parseFormats(rawOptions.format);
      const concurrency = Math.max(1, parseInt(rawOptions.concurrency, 10) || 2);
      const delayMs = Math.max(0, parseInt(rawOptions.delay, 10) || 350);
      const groupBy = (rawOptions.groupBy === 'none' ? 'none' : 'format') as GroupByStrategy;

      const options: DownloaderOptions = {
        username,
        outputDir,
        formats,
        groupBy,
        flat: Boolean(rawOptions.flat),
        includeConsidering: rawOptions.considering !== false,
        incremental: rawOptions.incremental !== false,
        concurrency,
        delayMs,
        token: rawOptions.token,
        dryRun: Boolean(rawOptions.dryRun),
        verbose: Boolean(rawOptions.verbose),
      };

      console.log('====================================================');
      console.log('        🃏 Moxfield Account Deck Downloader         ');
      console.log('====================================================');
      console.log(`User:         ${options.username}`);
      console.log(`Destination:  ${options.outputDir}`);
      console.log(`Formats:      ${options.formats.join(', ')}`);
      console.log(`Group By:     ${options.groupBy}`);
      console.log(`Incremental:  ${options.incremental ? 'Enabled' : 'Disabled'}`);
      console.log(`Mode:         ${options.dryRun ? 'DRY-RUN' : 'LIVE'}`);
      console.log('----------------------------------------------------');

      const downloader = new MoxfieldDownloader(options, {
        onMessage: (msg) => {
          console.log(`ℹ️  ${msg}`);
        },
        onProgress: (current, total, deck, status) => {
          const prefix = `[${current}/${total}]`;
          switch (status) {
            case 'downloading':
              console.log(`${prefix} ⏳ Downloading: "${deck.name}" (${deck.format})`);
              break;
            case 'done':
              console.log(`${prefix} ✅ Saved: "${deck.name}" [${deck.id}]`);
              break;
            case 'skipped':
              console.log(`${prefix} ⏩ Up-to-date (skipped): "${deck.name}"`);
              break;
            case 'failed':
              console.error(`${prefix} ❌ FAILED: "${deck.name}" [${deck.id}]`);
              break;
          }
        },
      });

      try {
        const result = await downloader.run();

        console.log('====================================================');
        console.log('                   Summary                          ');
        console.log('====================================================');
        console.log(`Total Found:      ${result.totalFound}`);
        console.log(`Downloaded/Saved: ${result.downloaded}`);
        console.log(`Skipped (Cached): ${result.skipped}`);
        console.log(`Failed:           ${result.failed}`);

        if (result.errors.length > 0) {
          console.log('----------------------------------------------------');
          console.log('Failed Decks:');
          for (const err of result.errors) {
            console.error(`- [${err.deckId}] ${err.deckName}: ${err.error}`);
          }
        }
        console.log('====================================================');

        if (result.failed > 0 && result.downloaded === 0 && result.skipped === 0) {
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`\n🚨 Fatal Error: ${err.message}`);
        if (options.verbose && err.stack) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    });

  program
    .command('git-history')
    .description('Generate daily git commits representing the edit history across all decks')
    .argument('<username>', 'Moxfield username')
    .option('-d, --dir <dir>', 'Target git repository directory with downloaded decks', '.')
    .option('-b, --branch <branch>', 'Branch to write historical commits to', 'history')
    .option('--orphan', 'Create branch as an orphan branch (clean chronological root)', true)
    .option('--no-orphan', 'Append to existing branch history without creating an orphan root')
    .option('--author-name <name>', 'Author name for git commits')
    .option('--author-email <email>', 'Author email for git commits')
    .option('--dry-run', 'Preview daily commits without creating git commits', false)
    .option('-v, --verbose', 'Enable verbose logging', false)
    .action(async (username: string, rawOptions: any) => {
      const repoDir = path.resolve(process.cwd(), rawOptions.dir);
      const builder = new GitHistoryBuilder({
        username,
        repoDir,
        branch: rawOptions.branch,
        orphan: rawOptions.orphan,
        authorName: rawOptions.authorName,
        authorEmail: rawOptions.authorEmail,
        dryRun: Boolean(rawOptions.dryRun),
        verbose: Boolean(rawOptions.verbose),
      });

      console.log('====================================================');
      console.log('      📜 Moxfield Git History Generator             ');
      console.log('====================================================');
      console.log(`User:          ${username}`);
      console.log(`Repository:    ${repoDir}`);
      console.log(`Target Branch: ${rawOptions.branch}`);
      console.log(`Mode:          ${rawOptions.dryRun ? 'DRY-RUN' : 'LIVE'}`);
      console.log('----------------------------------------------------');

      try {
        const result = await builder.run(
          (msg) => console.log(`ℹ️  ${msg}`),
          (current, total, deck) => {
            console.log(`[${current}/${total}] ⏳ Fetching history: "${deck}"`);
          }
        );

        console.log('====================================================');
        console.log('                   Summary                          ');
        console.log('====================================================');
        console.log(`Total Events:    ${result.totalEvents}`);
        console.log(`Total Days:      ${result.totalDays}`);
        console.log(`Commits Created: ${result.commitsCreated}`);
        console.log('====================================================');
      } catch (err: any) {
        console.error(`\n🚨 Fatal Error: ${err.message}`);
        if (rawOptions.verbose && err.stack) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    });

  return program;
}
