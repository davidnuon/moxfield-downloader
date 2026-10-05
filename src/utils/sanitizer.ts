/**
 * Sanitizes a deck name or string for use in filesystem paths.
 * Replaces illegal OS characters, removes control characters,
 * collapses redundant whitespace, and truncates length.
 */
export function sanitizeFilename(name: string, maxLength = 100): string {
  if (!name || typeof name !== 'string') {
    return 'Untitled';
  }

  const cleaned = name
    // Replace illegal characters: / \ : * ? " < > |
    .replace(/[\\/:*?"<>|]/g, '-')
    // Replace non-printable ASCII / control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Collapse multiple dashes or spaces
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    // Trim leading/trailing whitespace, dashes, and periods
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .trim();

  const finalName = cleaned.length === 0 ? 'Untitled' : cleaned;
  return finalName.slice(0, maxLength).trim();
}

/**
 * Returns a canonical, collision-free folder or base filename for a deck
 * by combining its sanitized title and unique Moxfield ID.
 */
export function getDeckFileBase(name: string, id: string): string {
  const safeName = sanitizeFilename(name);
  return `${safeName} [${id}]`;
}
