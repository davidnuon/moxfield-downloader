import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitHistoryBuilder } from '../src/history/git-history-builder.js';
import { MoxfieldHistoryItem } from '../src/types/history.js';
import { MoxfieldDeck } from '../src/types/moxfield.js';

const exec = promisify(execFile);

describe('GitHistoryBuilder', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-history-test-'));
    await exec('git', ['init'], { cwd: tempDir });
    await exec('git', ['config', 'user.name', 'Test User'], { cwd: tempDir });
    await exec('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });

    // Initial commit so HEAD exists
    await fs.writeFile(path.join(tempDir, '.gitignore'), '.moxfield-history-cache.json\n');
    await exec('git', ['add', '.gitignore'], { cwd: tempDir });
    await exec('git', ['commit', '-m', 'chore: initial commit'], { cwd: tempDir });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('correctly simulates timeline in dryRun mode without modifying git', async () => {
    // Setup a mock deck folder
    const commanderDir = path.join(tempDir, 'commander', 'TestDeck');
    await fs.mkdir(commanderDir, { recursive: true });

    const deck: MoxfieldDeck = {
      id: 'test1234',
      publicId: 'test1234',
      name: 'Test Commander Deck',
      format: 'commander',
      createdAtUtc: '2023-01-01T10:00:00Z',
      lastUpdatedAtUtc: '2023-01-02T12:00:00Z',
      mainboard: {
        count: 1,
        cards: {
          SolRing: {
            quantity: 1,
            card: {
              id: 'c1',
              name: 'Sol Ring',
              set: 'cmm',
              cn: '1',
            },
          },
        },
      },
    };

    await fs.writeFile(path.join(commanderDir, 'deck.json'), JSON.stringify(deck, null, 2));

    // Setup history cache
    const historyCache: Record<string, MoxfieldHistoryItem[]> = {
      test1234: [
        {
          boardType: 'mainboard',
          quantityDelta: 1,
          updatedAtUtc: '2023-01-02T12:00:00Z',
          card: {
            id: 'c1',
            name: 'Sol Ring',
            set: 'cmm',
            cn: '1',
          },
        },
      ],
    };

    await fs.writeFile(
      path.join(tempDir, '.moxfield-history-cache.json'),
      JSON.stringify(historyCache, null, 2)
    );

    const builder = new GitHistoryBuilder({
      username: 'testuser',
      repoDir: tempDir,
      branch: 'history',
      dryRun: true,
    });

    const result = await builder.run();
    expect(result.totalEvents).toBe(1);
    expect(result.totalDays).toBe(2); // 2023-01-01 (birth) and 2023-01-02 (edit)
    expect(result.commitsCreated).toBe(0);

    // Verify git branch history was not created
    const { stdout } = await exec('git', ['branch'], { cwd: tempDir });
    expect(stdout).not.toContain('history');
  });

  it('reconstructs daily commits and matches final state on disk', async () => {
    const commanderDir = path.join(tempDir, 'commander', 'TestDeck');
    await fs.mkdir(commanderDir, { recursive: true });

    const finalDeck: MoxfieldDeck = {
      id: 'test1234',
      publicId: 'test1234',
      name: 'Test Commander Deck',
      format: 'commander',
      createdAtUtc: '2023-01-01T10:00:00Z',
      lastUpdatedAtUtc: '2023-01-03T12:00:00Z',
      mainboard: {
        count: 2,
        cards: {
          'Sol Ring': {
            quantity: 1,
            card: {
              id: 'c1',
              name: 'Sol Ring',
              set: 'cmm',
              cn: '1',
            },
          },
          'Arcane Signet': {
            quantity: 1,
            card: {
              id: 'c2',
              name: 'Arcane Signet',
              set: 'cmm',
              cn: '2',
            },
          },
        },
      },
    };

    await fs.writeFile(path.join(commanderDir, 'deck.json'), JSON.stringify(finalDeck, null, 2));

    const historyCache: Record<string, MoxfieldHistoryItem[]> = {
      test1234: [
        {
          boardType: 'mainboard',
          quantityDelta: 1,
          updatedAtUtc: '2023-01-03T12:00:00Z',
          card: {
            id: 'c2',
            name: 'Arcane Signet',
            set: 'cmm',
            cn: '2',
          },
        },
        {
          boardType: 'mainboard',
          quantityDelta: 1,
          updatedAtUtc: '2023-01-01T10:00:00Z',
          card: {
            id: 'c1',
            name: 'Sol Ring',
            set: 'cmm',
            cn: '1',
          },
        },
      ],
    };

    await fs.writeFile(
      path.join(tempDir, '.moxfield-history-cache.json'),
      JSON.stringify(historyCache, null, 2)
    );

    const builder = new GitHistoryBuilder({
      username: 'tardyscholar',
      repoDir: tempDir,
      branch: 'history',
      orphan: true,
      dryRun: false,
    });

    const result = await builder.run();
    expect(result.totalEvents).toBe(2);
    expect(result.commitsCreated).toBeGreaterThanOrEqual(3);

    // Verify git log on history branch
    const { stdout: logOutput } = await exec(
      'git',
      ['log', '--format=%ad | %s', '--date=short', 'history'],
      { cwd: tempDir }
    );

    expect(logOutput).toContain('initialize moxfield repository structure');
    expect(logOutput).toContain('2023-01-01');
    expect(logOutput).toContain('2023-01-03');

    // Verify final file matches finalDeck
    const content = await fs.readFile(path.join(commanderDir, 'deck.json'), 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.mainboard.cards['Arcane Signet'].quantity).toBe(1);
    expect(parsed.mainboard.cards['Sol Ring'].quantity).toBe(1);
  });
});
