const IST = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60_000;

export function formatIST(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'short', ...opts }).format(
    new Date(iso),
  );
}

/** `<input type="datetime-local">` value, read as IST → UTC ISO string. */
export function istInputToUtcIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Invalid date and time');
  return new Date(`${local}:00+05:30`).toISOString();
}

export function utcToIstInput(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}
