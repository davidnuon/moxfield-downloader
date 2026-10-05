import { MoxfieldDeck } from '../types/moxfield.js';

export function exportToJson(deck: MoxfieldDeck): string {
  return JSON.stringify(deck, null, 2) + '\n';
}
