import { z } from 'zod';

export const MoxfieldCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  set: z.string().optional(),
  cn: z.string().optional(),
  mana_cost: z.string().optional(),
  type_line: z.string().optional(),
  scryfall_id: z.string().optional(),
  layout: z.string().optional(),
  card_faces: z
    .array(
      z.object({
        name: z.string(),
        mana_cost: z.string().optional(),
        type_line: z.string().optional(),
      })
    )
    .optional(),
}).passthrough();

export type MoxfieldCard = z.infer<typeof MoxfieldCardSchema>;

export const MoxfieldCardEntrySchema = z.object({
  quantity: z.number().int().nonnegative(),
  boardType: z.string().optional(),
  finish: z.string().optional(),
  isFoil: z.boolean().optional(),
  isAlter: z.boolean().optional(),
  card: MoxfieldCardSchema,
}).passthrough();

export type MoxfieldCardEntry = z.infer<typeof MoxfieldCardEntrySchema>;

export const MoxfieldBoardSchema = z.object({
  count: z.number().optional(),
  cards: z.record(z.string(), MoxfieldCardEntrySchema).default({}),
}).passthrough();

export type MoxfieldBoard = z.infer<typeof MoxfieldBoardSchema>;

export const MoxfieldDeckSummarySchema = z.object({
  id: z.string(),
  publicId: z.string().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  format: z.string().default('unknown'),
  visibility: z.string().optional(),
  publicUrl: z.string().optional(),
  viewCount: z.number().optional(),
  likeCount: z.number().optional(),
  isUnlisted: z.boolean().optional(),
  lastUpdatedAtUtc: z.string(),
  createdAtUtc: z.string().optional(),
  createdByUser: z
    .object({
      userName: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
}).passthrough();

export type MoxfieldDeckSummary = z.infer<typeof MoxfieldDeckSummarySchema>;

export const MoxfieldSearchResponseSchema = z.object({
  pageNumber: z.number(),
  pageSize: z.number(),
  totalResults: z.number(),
  totalPages: z.number(),
  data: z.array(MoxfieldDeckSummarySchema),
}).passthrough();

export type MoxfieldSearchResponse = z.infer<typeof MoxfieldSearchResponseSchema>;

export const MoxfieldDeckSchema = z.object({
  id: z.string(),
  publicId: z.string().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  format: z.string().default('unknown'),
  visibility: z.string().optional(),
  publicUrl: z.string().optional(),
  lastUpdatedAtUtc: z.string(),
  createdAtUtc: z.string().optional(),
  createdByUser: z
    .object({
      userName: z.string().optional(),
      displayName: z.string().optional(),
    })
    .optional(),
  mainboard: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  sideboard: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  commanders: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  companions: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  maybeboard: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  considering: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  signatureSpells: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  attractions: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  stickers: z.union([z.record(z.string(), MoxfieldCardEntrySchema), MoxfieldBoardSchema]).optional(),
  boards: z.record(z.string(), z.any()).optional(),
}).passthrough();

export type MoxfieldDeck = z.infer<typeof MoxfieldDeckSchema>;
