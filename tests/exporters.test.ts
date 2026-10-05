import { describe, expect, it } from 'vitest';
import { exportToJson } from '../src/exporters/json-exporter.js';
import { exportToMtgo } from '../src/exporters/mtgo-exporter.js';
import { exportToText } from '../src/exporters/text-exporter.js';
import { MoxfieldDeck } from '../src/types/moxfield.js';

const mockDeck: MoxfieldDeck = {
  id: 'test-deck-1',
  name: 'Test Atraxa',
  format: 'commander',
  lastUpdatedAtUtc: '2026-10-04T00:00:00Z',
  boards: {
    commanders: {
      count: 1,
      cards: {
        'atraxa-id': {
          quantity: 1,
          finish: 'foil',
          card: {
            id: 'c-1',
            name: "Atraxa, Praetors' Voice",
            set: 'cm2',
            cn: '1',
          },
        },
      },
    },
    mainboard: {
      count: 2,
      cards: {
        'sol-ring-id': {
          quantity: 1,
          card: {
            id: 'c-2',
            name: 'Sol Ring',
            set: 'c21',
            cn: '263',
          },
        },
        'command-tower-id': {
          quantity: 1,
          card: {
            id: 'c-3',
            name: 'Command Tower',
            set: 'c21',
            cn: '284',
          },
        },
      },
    },
    sideboard: {
      count: 1,
      cards: {
        'flusterstorm-id': {
          quantity: 1,
          card: {
            id: 'c-4',
            name: 'Flusterstorm',
            set: 'mh1',
            cn: '255',
          },
        },
      },
    },
    considering: {
      count: 1,
      cards: {
        'rhystic-study-id': {
          quantity: 1,
          card: {
            id: 'c-5',
            name: 'Rhystic Study',
            set: 'jmp',
            cn: '169',
          },
        },
      },
    },
  },
};

describe('exporters', () => {
  it('exports to formatted JSON', () => {
    const jsonStr = exportToJson(mockDeck);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.id).toBe('test-deck-1');
    expect(parsed.name).toBe('Test Atraxa');
  });

  it('exports to text/Arena format with section headers and foil marker', () => {
    const textStr = exportToText(mockDeck, { includeConsidering: true, detailed: true });

    expect(textStr).toContain('COMMANDER\n1 Atraxa, Praetors\' Voice (CM2) 1 *F*');
    expect(textStr).toContain('DECK\n1 Command Tower (C21) 284\n1 Sol Ring (C21) 263');
    expect(textStr).toContain('SIDEBOARD\n1 Flusterstorm (MH1) 255');
    expect(textStr).toContain('CONSIDERING\n1 Rhystic Study (JMP) 169');
  });

  it('respects includeConsidering=false', () => {
    const textStr = exportToText(mockDeck, { includeConsidering: false });
    expect(textStr).not.toContain('CONSIDERING');
  });

  it('exports to MTGO format placing commander in sideboard with SB: prefix', () => {
    const mtgoStr = exportToMtgo(mockDeck);

    expect(mtgoStr).toContain('1 Command Tower');
    expect(mtgoStr).toContain('1 Sol Ring');
    expect(mtgoStr).toContain('SB: 1 Atraxa, Praetors\' Voice');
    expect(mtgoStr).toContain('SB: 1 Flusterstorm');
  });
});
