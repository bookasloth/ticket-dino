'use client';
import { useEffect, useState } from 'react';

type State = { status: string; number: number; tickets: string[] };

export function OrderStatus({ id, k, supportEmail }: { id: string; k: string; supportEmail: string }) {
  const [s, setS] = useState<State | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let tries = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      tries++;
      try {
        const r = await fetch(`/api/orders/${id}?k=${encodeURIComponent(k)}`, { cache: 'no-store' });
        if (r.status === 404) return alive && setNotFound(true);
        if (r.ok) {
          const j: State = await r.json();
          if (!alive) return;
          setS(j);
          if (j.status === 'paid' || j.status === 'refunded') return;
        }
      } catch {
        // offline blip: keep polling
      }
      if (tries >= 90) return alive && setTimedOut(true); // ~3 minutes
      timer = setTimeout(poll, 2000);
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, k]);

  if (notFound) return <p>We couldn't find this order. Check the link in your email.</p>;

  if (s?.status === 'paid')
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">You're in!</h1>
        <p>Order TD-{s.number}. We've emailed your tickets too.</p>
        <ul className="space-y-2">
          {s.tickets.map((t, i) => (
            <li key={t}>
              <a className="block rounded-lg border p-3 font-medium text-primary" href={`/t/${t}`}>View ticket {i + 1}</a>
            </li>
          ))}
        </ul>
      </div>
    );

  if (s?.status === 'refunded')
    return <p>Order TD-{s.number} has been refunded. Check your email for details.</p>;

  if (timedOut)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Still confirming your payment</h1>
        <p>If money was debited, your tickets will be emailed as soon as the bank confirms it, usually within 15 minutes. If it can't be confirmed, the money is refunded automatically.</p>
        {supportEmail && <p className="text-sm text-muted-foreground">Questions? {supportEmail}{s ? ` · order TD-${s.number}` : ''}</p>}
      </div>
    );

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
      <h1 className="text-xl font-semibold">Confirming your payment…</h1>
      <p className="text-muted-foreground">This usually takes a few seconds. Please keep this page open.</p>
    </div>
  );
}
