import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { available, saleState } from '@/lib/availability';
import { formatIST } from '@/lib/time';
import { getPublicEvent } from '../data';
import { CheckoutForm } from './CheckoutForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const event = await getPublicEvent(slug);
  if (!event || event.status !== 'published') notFound();

  const utm = Object.fromEntries(
    Object.entries(sp).filter((e): e is [string, string] => e[0].startsWith('utm_') && typeof e[1] === 'string'),
  );
  const ticketTypes = event.ticket_types.map((t) => ({
    id: t.id, name: t.name, pricePaise: t.price_paise, gstRate: Number(t.gst_rate),
    maxPerOrder: t.max_per_order, state: saleState(t), available: available(t),
    groupMinQty: t.group_min_qty, groupPct: t.group_pct === null ? null : Number(t.group_pct),
  }));

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <p className="text-[11px] uppercase tracking-[0.3em] text-[#a3803f]">Checkout</p>
      <h1 className="mt-2 font-display text-3xl leading-tight">{event.title}</h1>
      <p className="text-muted-foreground">{formatIST(event.starts_at, { dateStyle: 'full' })}</p>
      <CheckoutForm
        event={{ id: event.id, title: event.title, feeBps: event.fee_bps, feeFlatPaise: event.fee_flat_paise, feeGstRate: Number(event.fee_gst_rate) }}
        ticketTypes={ticketTypes}
        addons={event.addons.map((a) => ({
          id: a.id, name: a.name, pricePaise: a.price_paise, gstRate: Number(a.gst_rate), maxPerOrder: a.max_per_order, available: Math.max(0, a.capacity - a.sold_count - a.held_count),
        }))}
        utm={utm}
      />
    </main>
  );
}
