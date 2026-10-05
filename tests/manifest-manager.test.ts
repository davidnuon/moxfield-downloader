import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestManager } from '../src/sync/manifest-manager.js';
import { MoxfieldDeck, MoxfieldDeckSummary } from '../src/types/moxfield.js';

describe('ManifestManager', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moxfield-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('initializes a fresh manifest when none exists', async () => {
    const manifest = await ManifestManager.load(tempDir, 'testuser');
    expect(manifest.version).toBe(1);
    expect(manifest.username).toBe('testuser');
    expect(manifest.decks).toEqual({});
  });

  it('saves and reloads manifest properly', async () => {
    const manifest = await ManifestManager.load(tempDir, 'testuser');

    const dummyDeck: MoxfieldDeck = {
      id: 'deck-123',
      name: 'Atraxa',
      format: 'commander',
      lastUpdatedAtUtc: '2026-10-04T12:00:00Z',
      boards: {},
    };

    ManifestManager.recordDeck(manifest, dummyDeck, ['commander/Atraxa [deck-123]/deck.json']);
    await ManifestManager.save(tempDir, manifest);

    const reloaded = await ManifestManager.load(tempDir, 'testuser');
    expect(reloaded.decks['deck-123']).toBeDefined();
    expect(reloaded.decks['deck-123'].name).toBe('Atraxa');
    expect(reloaded.decks['deck-123'].files).toEqual([
      'commander/Atraxa [deck-123]/deck.json',
    ]);
  });

  it('accurately identifies up-to-date vs modified decks', async () => {
    const manifest = await ManifestManager.load(tempDir, 'testuser');
    manifest.decks['deck-123'] = {
      id: 'deck-123',
      name: 'Atraxa',
      format: 'commander',
      lastUpdatedAtUtc: '2026-10-04T12:00:00Z',
      downloadedAtUtc: '2026-10-04T12:05:00Z',
      files: [],
    };

    const upToDateSummary: MoxfieldDeckSummary = {
      id: 'deck-123',
      name: 'Atraxa',
      format: 'commander',
      lastUpdatedAtUtc: '2026-10-04T12:00:00Z',
    };

    const newerSummary: MoxfieldDeckSummary = {
      id: 'deck-123',
      name: 'Atraxa',
      format: 'commander',
      lastUpdatedAtUtc: '2026-10-04T13:00:00Z',
    };

    const newDeckSummary: MoxfieldDeckSummary = {
      id: 'deck-999',
      name: 'Urza',
      format: 'commander',
      lastUpdatedAtUtc: '2026-10-04T12:00:00Z',
    };

    expect(ManifestManager.isDeckUpToDate(manifest, upToDateSummary)).toBe(true);
    expect(ManifestManager.isDeckUpToDate(manifest, newerSummary)).toBe(false);
    expect(ManifestManager.isDeckUpToDate(manifest, newDeckSummary)).toBe(false);
  });
});
