'use client';
import { useEffect, useState } from 'react';
import { formatINR } from '@/lib/money';
import { formatIST } from '@/lib/time';

type State = {
  status: string; number: number; tickets: string[];
  event: { title: string; slug: string; startsAt: string; endsAt: string; venue: string | null };
  lines: { name: string; qty: number }[];
  amounts: { subtotal: number; discount: number; fee: number; gst: number; total: number };
};

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** One-event .ics, built in the browser. */
function calendarHref(e: State['event'], number: number) {
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TicketDino//EN', 'BEGIN:VEVENT',
    `UID:td-${number}@ticketdino`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(e.startsAt)}`, `DTEND:${icsDate(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.venue ?? '')}`, `DESCRIPTION:Order TD-${number}. Show your QR at the door.`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className={`flex justify-between py-1.5 ${strong ? 'border-t pt-3 font-medium text-foreground' : ''}`}><dt>{k}</dt><dd>{v}</dd></div>
);

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

  if (notFound) return <p>We couldn&apos;t find this order. Check the link in your email.</p>;

  if (s?.status === 'paid') {
    const share = `https://wa.me/?text=${encodeURIComponent(`I'm going to ${s.event.title}! Book yours: ${location.origin}/e/${s.event.slug}`)}`;
    return (
      <div className="text-left">
        <p className="text-center text-[11px] uppercase tracking-[0.3em] text-[#a3803f]">Booking confirmed · TD-{s.number}</p>
        <h1 className="mt-3 text-center font-display text-5xl">You&apos;re in.</h1>
        <p className="mt-3 text-center text-muted-foreground">We&apos;ve emailed your tickets too.</p>

        <div className="mt-10 border p-6">
          <h2 className="font-display text-2xl">{s.event.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{formatIST(s.event.startsAt, { dateStyle: 'full' })}{s.event.venue ? ` · ${s.event.venue}` : ''}</p>
          <ul className="mt-5 divide-y border-y">
            {s.tickets.map((t, i) => (
              <li key={t}>
                <a className="flex justify-between py-3 text-sm hover:text-primary" href={`/t/${t}`}>
                  <span>Ticket {i + 1}</span><span className="text-xs uppercase tracking-[0.15em]">View QR →</span>
                </a>
              </li>
            ))}
          </ul>
          <dl className="mt-5 text-sm text-muted-foreground">
            {s.lines.map((l) => <Row key={l.name} k={l.name} v={`× ${l.qty}`} />)}
            {s.amounts.discount > 0 && <Row k="You saved" v={`−${formatINR(s.amounts.discount)}`} />}
            <Row k="Total paid" v={formatINR(s.amounts.total)} strong />
          </dl>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <a href={calendarHref(s.event, s.number)} download={`td-${s.number}.ics`}
             className="rounded-sm border px-4 py-3 text-center text-xs uppercase tracking-[0.15em] transition-colors hover:border-foreground">Add to calendar</a>
          <a href={share} target="_blank" rel="noopener noreferrer"
             className="rounded-sm border px-4 py-3 text-center text-xs uppercase tracking-[0.15em] transition-colors hover:border-foreground">Share on WhatsApp</a>
        </div>
      </div>
    );
  }

  if (s?.status === 'refunded')
    return <p>Order TD-{s.number} has been refunded. Check your email for details.</p>;

  if (timedOut)
    return (
      <div className="space-y-3">
        <h1 className="font-display text-3xl">Still confirming your payment</h1>
        <p className="text-muted-foreground">If money was debited, your tickets will be emailed as soon as the bank confirms it, usually within 15 minutes. If it can&apos;t be confirmed, the money is refunded automatically.</p>
        {supportEmail && <p className="text-sm text-muted-foreground">Questions? {supportEmail}{s ? ` · order TD-${s.number}` : ''}</p>}
      </div>
    );

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <h1 className="font-display text-3xl">Confirming your payment…</h1>
      <p className="text-muted-foreground">This usually takes a few seconds. Please keep this page open.</p>
    </div>
  );
}
