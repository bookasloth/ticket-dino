export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const ticketUrl = (token: string) => `${appUrl()}/t/${token}`;

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** QR codes hold the ticket URL; also accept a bare token typed by hand. */
export function tokenFromScan(text: string): string | null {
  const t = text.trim();
  if (TOKEN.test(t)) return t;
  const m = t.match(/\/t\/([A-Za-z0-9_-]{22})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

export const isToken = (t: string) => TOKEN.test(t);
