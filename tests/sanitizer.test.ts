import { describe, expect, it } from 'vitest';
import { getDeckFileBase, sanitizeFilename } from '../src/utils/sanitizer.js';

describe('sanitizer', () => {
  it('replaces illegal filesystem characters', () => {
    expect(sanitizeFilename('Atraxa: Voice / Praetors *Special*?')).toBe(
      'Atraxa- Voice - Praetors -Special'
    );
  });

  it('collapses redundant whitespace and dashes', () => {
    expect(sanitizeFilename('Deck   ---   Name')).toBe('Deck - Name');
  });

  it('handles empty or blank names', () => {
    expect(sanitizeFilename('')).toBe('Untitled');
    expect(sanitizeFilename('   ')).toBe('Untitled');
    expect(sanitizeFilename('///')).toBe('Untitled');
  });

  it('truncates overly long titles', () => {
    const longName = 'A'.repeat(150);
    expect(sanitizeFilename(longName, 50).length).toBe(50);
  });

  it('formats deck file base with ID', () => {
    expect(getDeckFileBase('Urza // Mishra', 'k8X1j2n34A')).toBe(
      'Urza - Mishra [k8X1j2n34A]'
    );
  });
});
