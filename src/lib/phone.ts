// Spaces (incl. NBSP), dashes, dots, brackets and the invisible bidi/zero-width marks phones add when copying contacts.
const FORMATTING = /[\s\-().\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Accepts common Indian mobile formats; returns +91XXXXXXXXXX or null. */
export function normalizeIndianPhone(input: string): string | null {
  const compact = input.replace(FORMATTING, '');
  const m = compact.match(/^(?:\+91|0091|91)?0?([6-9]\d{9})$/);
  return m ? `+91${m[1]}` : null;
}
