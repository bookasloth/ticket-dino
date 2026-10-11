import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { saleState } from '@/lib/availability';
import { formatINR } from '@/lib/money';
import { formatIST } from '@/lib/time';
import { getPublicEvent } from './data';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEvent((await params).slug);
  if (!event) return {};
  const description = `${formatIST(event.starts_at)} · ${event.venue?.name ?? ''}`.trim();
  return {
    title: `${event.title} · TicketDino`,
    description,
    openGraph: { title: event.title, description, images: event.poster_url ? [event.poster_url] : [] },
  };
}

const LABEL = { on_sale: null, sold_out: 'Sold out', not_started: 'Not on sale yet', ended: 'Sales closed' } as const;

export default async function EventPage({ params }: Props) {
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();

  const states = event.ticket_types.map((t) => saleState(t));
  const canBuy = event.status === 'published' && states.includes('on_sale');
  const mapsUrl =
    event.venue?.maps_url ??
    (event.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue.name} ${event.venue.city ?? ''}`)}` : null);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-6">
      {event.poster_url && (
        <Image src={event.poster_url} alt={event.title} width={1200} height={630} priority
               className="mb-6 aspect-[1200/630] w-full rounded-xl object-cover" sizes="(max-width: 768px) 100vw, 768px" />
      )}
      {event.status === 'cancelled' && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-destructive">This event has been cancelled.</p>
      )}
      <h1 className="text-2xl font-bold sm:text-3xl">{event.title}</h1>
      <p className="mt-1 text-muted-foreground">by {event.organizer.name}</p>

      <dl className="mt-4 space-y-2">
        <div><dt className="sr-only">When</dt><dd>{formatIST(event.starts_at, { dateStyle: 'full' })}</dd></div>
        {event.venue && (
          <div>
            <dt className="sr-only">Where</dt>
            <dd>
              {event.venue.name}{event.venue.city ? `, ${event.venue.city}` : ''}
              {mapsUrl && <> · <a className="text-primary underline" href={mapsUrl} target="_blank" rel="noopener noreferrer">Map</a></>}
            </dd>
          </div>
        )}
      </dl>

      <section className="mt-6 space-y-2" aria-label="Tickets">
        {event.ticket_types.map((t, i) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
            <span className="font-medium">{t.name}</span>
            <span className="flex items-center gap-2">
              {LABEL[states[i]] && <Badge variant="secondary">{LABEL[states[i]]}</Badge>}
              <span>{t.price_paise === 0 ? 'Free' : formatINR(t.price_paise)}</span>
            </span>
          </div>
        ))}
        {event.ticket_types.some((t) => t.gst_rate > 0) && (
          <p className="text-xs text-muted-foreground">Prices exclude GST and booking fee, shown before payment.</p>
        )}
      </section>

      {event.description && <section className="mt-8 whitespace-pre-line">{event.description}</section>}

      {event.faqs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">FAQs</h2>
          {event.faqs.map((f) => (
            <details key={f.q} className="border-b py-2">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-1 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {event.refund_policy && (
        <section className="mt-8 text-sm text-muted-foreground">
          <h2 className="mb-1 font-semibold text-foreground">Refund policy</h2>
          <p>{event.refund_policy}</p>
        </section>
      )}

      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <Link href={`/e/${event.slug}/checkout`} className={buttonVariants({ size: 'lg', className: 'h-11 w-full' })}>
              Get tickets
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
