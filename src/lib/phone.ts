/** Accepts common Indian mobile formats; returns +91XXXXXXXXXX or null. */
export function normalizeIndianPhone(input: string): string | null {
  const compact = input.replace(/[\s\-()]/g, '');
  const m = compact.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return m ? `+91${m[1]}` : null;
}
