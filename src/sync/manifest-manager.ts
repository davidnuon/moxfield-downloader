import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Manifest, ManifestSchema } from '../types/manifest.js';
import { MoxfieldDeck, MoxfieldDeckSummary } from '../types/moxfield.js';

export const MANIFEST_FILENAME = '.moxfield-manifest.json';

export class ManifestManager {
  static async load(outputDir: string, username: string): Promise<Manifest> {
    const manifestPath = path.join(outputDir, MANIFEST_FILENAME);

    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      const parsed = JSON.parse(content);
      const validated = ManifestSchema.safeParse(parsed);

      if (validated.success && validated.data.username.toLowerCase() === username.toLowerCase()) {
        return validated.data;
      }
    } catch {
      // Manifest does not exist or invalid JSON; return fresh manifest
    }

    return {
      version: 1,
      username,
      lastSyncUtc: new Date(0).toISOString(),
      decks: {},
    };
  }

  static async save(outputDir: string, manifest: Manifest): Promise<void> {
    const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
    const tempPath = `${manifestPath}.tmp.${Date.now()}`;

    await fs.mkdir(outputDir, { recursive: true });
    manifest.lastSyncUtc = new Date().toISOString();

    const data = JSON.stringify(manifest, null, 2) + '\n';
    await fs.writeFile(tempPath, data, 'utf8');
    await fs.rename(tempPath, manifestPath);
  }

  static isDeckUpToDate(manifest: Manifest, summary: MoxfieldDeckSummary): boolean {
    const existing = manifest.decks[summary.id];
    if (!existing) {
      return false;
    }

    // Compare ISO date strings or timestamps
    const remoteUpdated = new Date(summary.lastUpdatedAtUtc).getTime();
    const localUpdated = new Date(existing.lastUpdatedAtUtc).getTime();

    return !Number.isNaN(remoteUpdated) && !Number.isNaN(localUpdated) && localUpdated >= remoteUpdated;
  }

  static recordDeck(
    manifest: Manifest,
    deck: MoxfieldDeck,
    relativeFiles: string[]
  ): void {
    manifest.decks[deck.id] = {
      id: deck.id,
      name: deck.name,
      format: deck.format,
      lastUpdatedAtUtc: deck.lastUpdatedAtUtc,
      downloadedAtUtc: new Date().toISOString(),
      files: relativeFiles,
    };
  }
}
