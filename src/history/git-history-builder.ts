import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { MoxfieldClient } from '../api/moxfield-client.js';
import { exportToJson } from '../exporters/json-exporter.js';
import { exportToText } from '../exporters/text-exporter.js';
import { DeckEditEvent, MoxfieldHistoryItem } from '../types/history.js';
import { MoxfieldCardEntry, MoxfieldDeck } from '../types/moxfield.js';

const exec = promisify(execFile);

export interface GitHistoryOptions {
  username: string;
  repoDir: string;
  branch?: string;
  orphan?: boolean;
  authorName?: string;
  authorEmail?: string;
  concurrency?: number;
  delayMs?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

type MutableBoards = Record<string, Record<string, MoxfieldCardEntry>>;

export interface DeckRecord {
  deckDir: string;
  formatDirName: string;
  deckFolder: string;
  currentDeck: MoxfieldDeck;
  events: DeckEditEvent[];
  initialDeck: MoxfieldDeck;
  dailySnapshots: Map<string, MoxfieldDeck>;
  birthDay: string;
}

function extractCardsMap(rawBoard: any): Record<string, MoxfieldCardEntry> {
  if (!rawBoard) return {};
  if (rawBoard.cards && typeof rawBoard.cards === 'object') {
    return JSON.parse(JSON.stringify(rawBoard.cards));
  }
  if (typeof rawBoard === 'object') {
    return JSON.parse(JSON.stringify(rawBoard));
  }
  return {};
}

function cloneDeckBoards(deck: MoxfieldDeck): MutableBoards {
  return {
    commanders: extractCardsMap(deck.commanders ?? (deck as any).boards?.commanders),
    mainboard: extractCardsMap(deck.mainboard ?? (deck as any).boards?.mainboard),
    sideboard: extractCardsMap(deck.sideboard ?? (deck as any).boards?.sideboard),
    companions: extractCardsMap(deck.companions ?? (deck as any).boards?.companions),
    maybeboard: extractCardsMap(
      deck.maybeboard ?? deck.considering ?? (deck as any).boards?.maybeboard ?? (deck as any).boards?.considering
    ),
    signatureSpells: extractCardsMap(deck.signatureSpells ?? (deck as any).boards?.signatureSpells),
    attractions: extractCardsMap(deck.attractions ?? (deck as any).boards?.attractions),
    stickers: extractCardsMap(deck.stickers ?? (deck as any).boards?.stickers),
    tokens: extractCardsMap((deck as any).tokens ?? (deck as any).boards?.tokens),
  };
}

function resolveBoardName(boardType: string, boards: MutableBoards): string {
  if (boardType === 'partners') return 'commanders';
  if (boardType === 'considering') return 'maybeboard';
  if (boardType in boards) return boardType;
  return 'mainboard';
}

function assembleDeckFromBoards(base: MoxfieldDeck, boards: MutableBoards): MoxfieldDeck {
  return {
    ...base,
    commanders: JSON.parse(JSON.stringify(boards.commanders)),
    mainboard: JSON.parse(JSON.stringify(boards.mainboard)),
    sideboard: JSON.parse(JSON.stringify(boards.sideboard)),
    companions: JSON.parse(JSON.stringify(boards.companions)),
    maybeboard: JSON.parse(JSON.stringify(boards.maybeboard)),
    signatureSpells: JSON.parse(JSON.stringify(boards.signatureSpells)),
    attractions: JSON.parse(JSON.stringify(boards.attractions)),
    stickers: JSON.parse(JSON.stringify(boards.stickers)),
    tokens: JSON.parse(JSON.stringify(boards.tokens)),
  } as any;
}

export class GitHistoryBuilder {
  private client: MoxfieldClient;
  private options: GitHistoryOptions;

  constructor(options: GitHistoryOptions) {
    this.options = options;
    this.client = new MoxfieldClient({
      concurrency: options.concurrency ?? 2,
      delayMs: options.delayMs ?? 350,
      verbose: options.verbose ?? false,
    });
  }

  async run(
    onMessage?: (msg: string) => void,
    onProgress?: (current: number, total: number, deckName: string) => void
  ): Promise<{ totalEvents: number; totalDays: number; commitsCreated: number }> {
    const { repoDir, username, dryRun, branch = 'history', orphan = true } = this.options;
    const authorName = this.options.authorName || username;
    const authorEmail =
      this.options.authorEmail || `${username}@users.noreply.moxfield.com`;

    onMessage?.(`Scanning existing downloaded decks in ${repoDir}...`);

    // 1. Locate all deck.json files in the repository
    const deckRecords = await this.discoverDecks(repoDir);
    onMessage?.(`Found ${deckRecords.length} deck(s) on disk. Fetching edit histories...`);

    // 2. Fetch history for all decks with local cache
    let totalEvents = 0;
    const cacheFilePath = path.join(repoDir, '.moxfield-history-cache.json');
    let historyCache: Record<string, MoxfieldHistoryItem[]> = {};

    try {
      const cacheContent = await fs.readFile(cacheFilePath, 'utf8');
      historyCache = JSON.parse(cacheContent);
    } catch {
      // cache missing or invalid
    }

    for (let i = 0; i < deckRecords.length; i++) {
      const record = deckRecords[i];
      const publicId = record.currentDeck.publicId || record.currentDeck.id;
      onProgress?.(i + 1, deckRecords.length, record.currentDeck.name);

      let historyItems: MoxfieldHistoryItem[];
      if (historyCache[publicId]) {
        historyItems = historyCache[publicId];
      } else {
        historyItems = await this.client.getDeckHistory(publicId);
        historyCache[publicId] = historyItems;
      }

      for (const item of historyItems) {
        const dateStr = item.updatedAtUtc.slice(0, 10); // YYYY-MM-DD
        record.events.push({
          deckId: record.currentDeck.id,
          deckName: record.currentDeck.name,
          publicId,
          format: record.currentDeck.format,
          boardType: item.boardType,
          card: item.card,
          quantityDelta: item.quantityDelta,
          timestamp: item.updatedAtUtc,
          dateStr,
        });
        totalEvents++;
      }

      // Calculate birthday for deck: min(createdAtUtc, earliestEventDate)
      const earliestEvent = record.events.length > 0
        ? record.events.reduce((min, e) => (e.dateStr < min ? e.dateStr : min), record.events[0].dateStr)
        : undefined;
      const createdDate = record.currentDeck.createdAtUtc
        ? record.currentDeck.createdAtUtc.slice(0, 10)
        : undefined;

      record.birthDay =
        [createdDate, earliestEvent].filter((d): d is string => Boolean(d)).sort()[0] || '2020-01-01';
    }

    // Persist cache
    try {
      await fs.writeFile(cacheFilePath, JSON.stringify(historyCache, null, 2), 'utf8');
    } catch {
      // Ignore cache save error
    }

    onMessage?.(`Collected ${totalEvents} edit event(s) across all decks.`);

    // 3. Group events by calendar day and include deck birth days
    const dayMap = new Map<string, DeckEditEvent[]>();
    const allDaysSet = new Set<string>();

    for (const record of deckRecords) {
      allDaysSet.add(record.birthDay);
      for (const ev of record.events) {
        let list = dayMap.get(ev.dateStr);
        if (!list) {
          list = [];
          dayMap.set(ev.dateStr, list);
        }
        list.push(ev);
        allDaysSet.add(ev.dateStr);
      }
    }

    const sortedDays = Array.from(allDaysSet).sort();
    onMessage?.(`Timeline spans ${sortedDays.length} active day(s).`);

    if (sortedDays.length === 0) {
      onMessage?.(`No edit history found to reconstruct.`);
      return { totalEvents: 0, totalDays: 0, commitsCreated: 0 };
    }

    // 4. Reverse-Delta State Reconstruction for each deck
    onMessage?.(`Computing historical deck states via reverse deltas...`);
    for (const record of deckRecords) {
      // Sort events newest first for reverse traversal
      const reverseEvents = [...record.events].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Group reverse events by day
      const reverseDaysMap = new Map<string, DeckEditEvent[]>();
      for (const ev of reverseEvents) {
        let list = reverseDaysMap.get(ev.dateStr);
        if (!list) {
          list = [];
          reverseDaysMap.set(ev.dateStr, list);
        }
        list.push(ev);
      }

      // Unique days for this deck (newest to oldest)
      const deckDaysReverse = Array.from(reverseDaysMap.keys()).sort().reverse();

      const boards = cloneDeckBoards(record.currentDeck);

      // For each day from newest to oldest:
      // Current boards are the state AT THE END OF that day!
      for (const day of deckDaysReverse) {
        record.dailySnapshots.set(day, assembleDeckFromBoards(record.currentDeck, boards));

        // Now reverse that day's deltas to get the state BEFORE that day
        const dayEvs = reverseDaysMap.get(day) || [];
        for (const ev of dayEvs) {
          const boardName = resolveBoardName(ev.boardType, boards);
          const cardName = ev.card.name;
          const currentEntry = boards[boardName]?.[cardName];
          const currentQty = currentEntry?.quantity || 0;
          // Reverse: subtract addition, add removal
          const reversedQty = currentQty - ev.quantityDelta;

          if (reversedQty <= 0) {
            delete boards[boardName][cardName];
          } else {
            boards[boardName][cardName] = {
              quantity: reversedQty,
              card: ev.card,
            };
          }
        }
      }

      // The state before the earliest day
      record.initialDeck = assembleDeckFromBoards(record.currentDeck, boards);
    }

    if (dryRun) {
      onMessage?.(`[DRY-RUN] Simulating daily commit log:`);
      for (const day of sortedDays) {
        const events = dayMap.get(day) || [];
        const decksBorn = deckRecords.filter((r) => r.birthDay === day).length;
        const deckCount = new Set(events.map((e) => e.deckId)).size;
        onMessage?.(
          `  📅 ${day}: ${events.length} card change(s) across ${deckCount} deck(s)` +
            (decksBorn > 0 ? ` [${decksBorn} deck(s) created]` : '')
        );
      }
      return { totalEvents, totalDays: sortedDays.length, commitsCreated: 0 };
    }

    // 5. Git Commit Replay
    onMessage?.(`Preparing branch "${branch}" in ${repoDir}...`);

    // Ensure .moxfield-history-cache.json is excluded in git info/exclude
    try {
      const gitDir = path.join(repoDir, '.git');
      const excludePath = path.join(gitDir, 'info', 'exclude');
      let excludeContent = '';
      try {
        excludeContent = await fs.readFile(excludePath, 'utf8');
      } catch {
        // file may not exist yet
      }
      if (!excludeContent.includes('.moxfield-history-cache.json')) {
        await fs.mkdir(path.dirname(excludePath), { recursive: true });
        await fs.appendFile(
          excludePath,
          '\n.moxfield-history-cache.json\n*.moxfield-history*.json\n',
          'utf8'
        );
      }
    } catch {
      // ignore
    }

    if (orphan) {
      try {
        const { stdout } = await exec('git', ['branch', '--show-current'], { cwd: repoDir });
        if (stdout.trim() === branch) {
          await exec('git', ['checkout', '--detach', 'HEAD'], { cwd: repoDir });
        }
      } catch {
        // ignore
      }

      try {
        await exec('git', ['branch', '-D', branch], { cwd: repoDir });
      } catch {
        // branch did not exist
      }

      await exec('git', ['checkout', '--orphan', branch], { cwd: repoDir });
      try {
        await exec('git', ['rm', '--cached', '-r', '.'], { cwd: repoDir });
      } catch {
        // nothing staged
      }

      // Remove current deck format directories so we start clean from repository base
      for (const record of deckRecords) {
        try {
          await fs.rm(record.deckDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }

      // Commit repository base structure before earliest timeline day
      const earliestDay = sortedDays[0];
      const baselineDate = new Date(new Date(earliestDay).getTime() - 86400000)
        .toISOString()
        .slice(0, 10);

      await exec('git', ['add', '.'], { cwd: repoDir });

      const baselineEnv = {
        ...process.env,
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_AUTHOR_DATE: `${baselineDate} 12:00:00 +0000`,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
        GIT_COMMITTER_DATE: `${baselineDate} 12:00:00 +0000`,
      };

      try {
        await exec('git', ['commit', '-m', 'chore: initialize moxfield repository structure'], {
          cwd: repoDir,
          env: baselineEnv,
        });
      } catch {
        // nothing to commit
      }
    } else {
      await exec('git', ['checkout', '-B', branch], { cwd: repoDir });
    }

    let commitsCount = orphan ? 1 : 0;

    // Step B: Forward Replay for each calendar day
    for (let dayIndex = 0; dayIndex < sortedDays.length; dayIndex++) {
      const day = sortedDays[dayIndex];
      const dayEvents = dayMap.get(day) || [];

      // Find decks that were born on this day or edited on this day
      const decksBornToday = deckRecords.filter((r) => r.birthDay === day);
      const decksEditedToday = deckRecords.filter((r) => {
        const evs = dayEvents.filter((e) => e.deckId === r.currentDeck.id);
        return evs.length > 0;
      });

      const touchedDecks = new Set([...decksBornToday, ...decksEditedToday]);
      if (touchedDecks.size === 0) continue;

      // Update files on disk for touched decks
      for (const record of touchedDecks) {
        const snapshot = record.dailySnapshots.get(day) ?? record.initialDeck;
        await this.writeDeckFiles(record.deckDir, snapshot);
      }

      await exec('git', ['add', '.'], { cwd: repoDir });

      // Generate informative commit message
      const touchedList = Array.from(touchedDecks);
      const commitTitle =
        touchedList.length === 1
          ? `feat(${touchedList[0].currentDeck.name}): deck updates on ${day}`
          : `chore: deck updates across ${touchedList.length} decks on ${day}`;

      const bodyLines: string[] = [];
      for (const record of touchedList) {
        const evs = dayEvents.filter((e) => e.deckId === record.currentDeck.id);
        const isBorn = record.birthDay === day;
        bodyLines.push(`${record.currentDeck.name} [${record.currentDeck.id}]:`);
        if (isBorn && evs.length === 0) {
          bodyLines.push(
            `  * Created deck "${record.currentDeck.name}" (${record.currentDeck.format})`
          );
        } else {
          for (const ev of evs) {
            const sign =
              ev.quantityDelta > 0 ? `+ ${ev.quantityDelta}` : `- ${Math.abs(ev.quantityDelta)}`;
            bodyLines.push(`  ${sign} ${ev.card.name} (${ev.boardType})`);
          }
        }
        bodyLines.push('');
      }

      const commitMessage = `${commitTitle}\n\n${bodyLines.join('\n').trimEnd()}`;
      const commitDate = `${day} 12:00:00 +0000`;
      const env = {
        ...process.env,
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_AUTHOR_DATE: commitDate,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
        GIT_COMMITTER_DATE: commitDate,
      };

      try {
        await exec('git', ['commit', '-m', commitMessage], {
          cwd: repoDir,
          env,
        });
        commitsCount++;
        onMessage?.(`[${dayIndex + 1}/${sortedDays.length}] ✅ Committed edits for ${day}`);
      } catch (err: any) {
        if (!err.message.includes('nothing to commit')) {
          throw err;
        }
      }
    }

    // Step C: Ensure final files match the current verified state on disk
    for (const record of deckRecords) {
      await this.writeDeckFiles(record.deckDir, record.currentDeck);
    }
    await exec('git', ['add', '.'], { cwd: repoDir });
    try {
      const envLatest = {
        ...process.env,
        GIT_AUTHOR_NAME: authorName,
        GIT_AUTHOR_EMAIL: authorEmail,
        GIT_AUTHOR_DATE: `${new Date().toISOString().slice(0, 10)} 12:00:00 +0000`,
        GIT_COMMITTER_NAME: authorName,
        GIT_COMMITTER_EMAIL: authorEmail,
        GIT_COMMITTER_DATE: `${new Date().toISOString().slice(0, 10)} 12:00:00 +0000`,
      };
      await exec('git', ['commit', '-m', `chore: synchronize latest deck state with Moxfield`], {
        cwd: repoDir,
        env: envLatest,
      });
      commitsCount++;
    } catch {
      // exact match with last commit, nothing to commit
    }

    onMessage?.(`Successfully created ${commitsCount} historical commit(s) on branch "${branch}".`);
    return { totalEvents, totalDays: sortedDays.length, commitsCreated: commitsCount };
  }

  private async writeDeckFiles(deckDir: string, deck: MoxfieldDeck): Promise<void> {
    await fs.mkdir(deckDir, { recursive: true });
    const jsonPath = path.join(deckDir, 'deck.json');
    const txtPath = path.join(deckDir, 'deck.txt');

    await fs.writeFile(jsonPath, exportToJson(deck), 'utf8');
    await fs.writeFile(txtPath, exportToText(deck, { includeConsidering: true }), 'utf8');
  }

  private async discoverDecks(repoDir: string): Promise<DeckRecord[]> {
    const records: DeckRecord[] = [];
    const entries = await fs.readdir(repoDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const formatDir = path.join(repoDir, entry.name);
      let subEntries;
      try {
        subEntries = await fs.readdir(formatDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const sub of subEntries) {
        if (!sub.isDirectory() || sub.name.startsWith('.')) continue;

        const deckDir = path.join(formatDir, sub.name);
        const jsonPath = path.join(deckDir, 'deck.json');

        try {
          const content = await fs.readFile(jsonPath, 'utf8');
          const currentDeck = JSON.parse(content) as MoxfieldDeck;
          records.push({
            deckDir,
            formatDirName: entry.name,
            deckFolder: sub.name,
            currentDeck,
            events: [],
            initialDeck: currentDeck,
            dailySnapshots: new Map(),
            birthDay: '2020-01-01',
          });
        } catch {
          // not a valid deck folder, ignore
        }
      }
    }

    return records;
  }
}
