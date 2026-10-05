import { MoxfieldCardEntry, MoxfieldDeck } from '../types/moxfield.js';

export interface TextExportOptions {
  includeConsidering?: boolean;
  detailed?: boolean; // include set and collector number
}

function extractBoardCards(boardOrCards: any): Record<string, MoxfieldCardEntry> {
  if (!boardOrCards) return {};
  if (boardOrCards.cards && typeof boardOrCards.cards === 'object') {
    return boardOrCards.cards;
  }
  if (typeof boardOrCards === 'object') {
    return boardOrCards;
  }
  return {};
}

function formatCardLine(entry: MoxfieldCardEntry, detailed = true): string {
  const qty = entry.quantity;
  const name = entry.card.name;

  if (!detailed || !entry.card.set) {
    return `${qty} ${name}`;
  }

  const setCode = entry.card.set.toUpperCase();
  const cn = entry.card.cn ? ` ${entry.card.cn}` : '';
  const finish =
    entry.finish === 'foil' || entry.isFoil
      ? ' *F*'
      : entry.finish === 'etched'
      ? ' *E*'
      : '';

  return `${qty} ${name} (${setCode})${cn}${finish}`.trim();
}

function renderBoardSection(
  sectionTitle: string,
  rawBoard: any,
  detailed: boolean
): string[] {
  const cardsRecord = extractBoardCards(rawBoard);
  const entries = Object.values(cardsRecord).filter(
    (e) => e && typeof e.quantity === 'number' && e.quantity > 0 && e.card?.name
  );
  if (entries.length === 0) return [];

  // Sort alphabetically by card name
  entries.sort((a, b) => a.card.name.localeCompare(b.card.name));

  const lines: string[] = [sectionTitle];
  for (const entry of entries) {
    lines.push(formatCardLine(entry, detailed));
  }
  lines.push(''); // Trailing blank line
  return lines;
}

export function exportToText(
  deck: MoxfieldDeck,
  options: TextExportOptions = {}
): string {
  const { includeConsidering = true, detailed = true } = options;
  const lines: string[] = [];

  const boards = deck.boards || {};

  // 1. Commanders
  const commanders = deck.commanders ?? boards.commanders;
  if (commanders) {
    lines.push(...renderBoardSection('COMMANDER', commanders, detailed));
  }

  // 2. Companions
  const companions = deck.companions ?? boards.companions;
  if (companions) {
    lines.push(...renderBoardSection('COMPANION', companions, detailed));
  }

  // 3. Signature Spells (Oathbreaker)
  const signatureSpells = deck.signatureSpells ?? boards.signatureSpells;
  if (signatureSpells) {
    lines.push(...renderBoardSection('SIGNATURE SPELL', signatureSpells, detailed));
  }

  // 4. Mainboard / Deck
  const mainboard = deck.mainboard ?? boards.mainboard;
  if (mainboard) {
    lines.push(...renderBoardSection('DECK', mainboard, detailed));
  }

  // 5. Sideboard
  const sideboard = deck.sideboard ?? boards.sideboard;
  if (sideboard) {
    lines.push(...renderBoardSection('SIDEBOARD', sideboard, detailed));
  }

  // 6. Attractions & Stickers
  const attractions = deck.attractions ?? boards.attractions;
  if (attractions) {
    lines.push(...renderBoardSection('ATTRACTIONS', attractions, detailed));
  }
  const stickers = deck.stickers ?? boards.stickers;
  if (stickers) {
    lines.push(...renderBoardSection('STICKERS', stickers, detailed));
  }

  // 7. Considering / Maybeboard
  if (includeConsidering) {
    const considering =
      deck.maybeboard ?? deck.considering ?? boards.maybeboard ?? boards.considering;
    if (considering) {
      lines.push(...renderBoardSection('CONSIDERING', considering, detailed));
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
