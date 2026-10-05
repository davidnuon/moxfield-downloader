import { z } from 'zod';

export const ManifestDeckEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  format: z.string(),
  lastUpdatedAtUtc: z.string(),
  downloadedAtUtc: z.string(),
  files: z.array(z.string()),
});

export type ManifestDeckEntry = z.infer<typeof ManifestDeckEntrySchema>;

export const ManifestSchema = z.object({
  version: z.literal(1).default(1),
  username: z.string(),
  lastSyncUtc: z.string(),
  decks: z.record(z.string(), ManifestDeckEntrySchema).default({}),
});

export type Manifest = z.infer<typeof ManifestSchema>;
