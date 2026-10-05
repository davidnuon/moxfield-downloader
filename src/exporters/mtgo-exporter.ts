import { MoxfieldCardEntry, MoxfieldDeck } from '../types/moxfield.js';

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

function formatMtgoLine(entry: MoxfieldCardEntry, isSideboard = false): string {
  const prefix = isSideboard ? 'SB: ' : '';
  return `${prefix}${entry.quantity} ${entry.card.name}`;
}

export function exportToMtgo(deck: MoxfieldDeck): string {
  const lines: string[] = [];
  const boards = deck.boards || {};

  // Mainboard cards
  const mainboard = deck.mainboard ?? boards.mainboard;
  if (mainboard) {
    const mainEntries = Object.values(extractBoardCards(mainboard))
      .filter((e) => e && e.quantity > 0 && e.card?.name)
      .sort((a, b) => a.card.name.localeCompare(b.card.name));

    for (const entry of mainEntries) {
      lines.push(formatMtgoLine(entry, false));
    }
  }

  // Sideboard cards (includes commanders and companions in MTGO convention)
  const sideboardEntries: MoxfieldCardEntry[] = [];

  const commanders = deck.commanders ?? boards.commanders;
  if (commanders) {
    sideboardEntries.push(...Object.values(extractBoardCards(commanders)));
  }

  const companions = deck.companions ?? boards.companions;
  if (companions) {
    sideboardEntries.push(...Object.values(extractBoardCards(companions)));
  }

  const sideboard = deck.sideboard ?? boards.sideboard;
  if (sideboard) {
    sideboardEntries.push(...Object.values(extractBoardCards(sideboard)));
  }

  const validSideboard = sideboardEntries
    .filter((e) => e && e.quantity > 0 && e.card?.name)
    .sort((a, b) => a.card.name.localeCompare(b.card.name));

  if (validSideboard.length > 0) {
    if (lines.length > 0) {
      lines.push(''); // Blank line separator before sideboard in MTGO format
    }
    for (const entry of validSideboard) {
      lines.push(formatMtgoLine(entry, true));
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
