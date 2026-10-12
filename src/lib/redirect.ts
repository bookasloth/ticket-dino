/** Post-login redirect target: same-origin paths only (blocks //evil, /\evil, tab tricks, absolute URLs). */
export function safeNext(next: string): string {
  if (!next.startsWith('/')) return '/admin';
  const url = new URL(next, 'http://local.invalid');
  return url.origin === 'http://local.invalid' ? url.pathname + url.search : '/admin';
}
