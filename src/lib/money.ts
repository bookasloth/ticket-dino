const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export const formatINR = (paise: number) => inr.format(paise / 100);

/** "499.5" → 49950. Exact (no float math). null if invalid. */
export function rupeesToPaise(input: string): number | null {
  const m = input.trim().match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export const paiseToRupeesInput = (paise: number) => (paise / 100).toFixed(2);
