import { z } from 'zod';
import { MoxfieldCard, MoxfieldCardSchema } from './moxfield.js';

export const MoxfieldHistoryItemSchema = z.object({
  boardType: z.string(),
  card: MoxfieldCardSchema,
  cardType: z.string().optional(),
  quantityDelta: z.number(),
  updatedAtUtc: z.string(),
}).passthrough();

export type MoxfieldHistoryItem = z.infer<typeof MoxfieldHistoryItemSchema>;

export const MoxfieldHistoryResponseSchema = z.object({
  pageNumber: z.number(),
  pageSize: z.number(),
  totalResults: z.number(),
  totalPages: z.number(),
  data: z.array(MoxfieldHistoryItemSchema),
}).passthrough();

export type MoxfieldHistoryResponse = z.infer<typeof MoxfieldHistoryResponseSchema>;

export interface DeckEditEvent {
  deckId: string;
  deckName: string;
  publicId: string;
  format: string;
  boardType: string;
  card: MoxfieldCard;
  quantityDelta: number;
  timestamp: string;
  dateStr: string; // YYYY-MM-DD
}

export interface DailyEditGroup {
  dateStr: string;
  deckEdits: Record<
    string,
    {
      deckId: string;
      deckName: string;
      format: string;
      events: DeckEditEvent[];
    }
  >;
}
