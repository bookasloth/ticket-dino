import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PosterArt } from '@/components/PosterArt';
import { buttonVariants } from '@/components/ui/button';
import { available, saleState } from '@/lib/availability';
import { formatIST } from '@/lib/time';
import { mapsEmbed, shortINR, VENUE } from '@/lib/venue';
import { getPublicEvent } from './data';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEvent((await params).slug);
  if (!event) return {};
  const description = `${formatIST(event.starts_at)} · ${event.venue?.name ?? ''}`.trim();
  return {
    title: `${event.title} · ${event.organizer.name}`,
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
  const where = event.venue ? `${event.venue.name}${event.venue.city ? `, ${event.venue.city}` : ''}` : null;
  const mapsUrl =
    event.venue?.maps_url ??
    (where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}` : null);
  const hours = (new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 3_600_000;
  const min = Math.min(...event.ticket_types.map((t) => t.price_paise));
  const priceFrom = !Number.isFinite(min) ? null : min === 0 ? 'Free' : shortINR(min);
  const checkout = `/e/${event.slug}/checkout`;

  const facts = [
    { label: 'Date', value: formatIST(event.starts_at, { dateStyle: 'full', timeStyle: undefined }) },
    { label: 'Time', value: `${formatIST(event.starts_at, { dateStyle: undefined })} · ${hours % 1 ? hours.toFixed(1) : hours} hrs` },
    ...(where ? [{ label: 'Venue', value: where }] : []),
  ];

  return (
    <main className="pb-28 lg:pb-16">
      {/* Banner */}
      <section className="bg-[#1a1412] text-[#f3ead8]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 md:grid-cols-[1fr_1.1fr] md:py-20">
          {event.poster_url ? (
            <Image src={event.poster_url} alt={event.title} width={1200} height={630} priority
                   className="aspect-[4/5] w-full object-cover" sizes="(max-width: 768px) 100vw, 600px" />
          ) : (
            <PosterArt title={event.title} category={event.category} className="aspect-[4/5]" />
          )}
          <div>
            <nav className="text-[11px] uppercase tracking-[0.25em] text-[#f3ead8]/50"><Link href="/#events" className="hover:text-[#f3ead8]">Programme</Link> / {event.category ?? 'Event'}</nav>
            {event.category && (
              <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.35em] text-[#c9a25c]">{event.category}</p>
            )}
            <h1 className="mt-4 font-display text-4xl leading-[1.08] sm:text-6xl">{event.title}</h1>
            <p className="mt-4 font-light text-[#f3ead8]/60">Presented by {event.organizer.name}</p>
            <ul className="mt-10 divide-y divide-[#f3ead8]/10 border-y border-[#f3ead8]/10">
              {facts.map((f) => (
                <li key={f.label} className="flex items-baseline gap-6 py-4">
                  <span className="w-16 shrink-0 text-[11px] uppercase tracking-[0.2em] text-[#f3ead8]/45">{f.label}</span>
                  <span className="font-light">{f.value}</span>
                </li>
              ))}
            </ul>
            {canBuy && (
              <div className="mt-10 flex items-center gap-6">
                <Link href={checkout} className="rounded-sm bg-[#c9a25c] px-8 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#1a1412] transition-colors hover:bg-[#d8b36e]">Get tickets</Link>
                {priceFrom && <span className="text-sm font-light text-[#f3ead8]/60">from <span className="font-display text-2xl text-[#f3ead8]">{priceFrom}</span></span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {event.status === 'cancelled' && (
        <p className="mx-auto mt-6 max-w-6xl rounded-md bg-destructive/10 p-3 text-destructive">This event has been cancelled.</p>
      )}

      <div className="mx-auto grid max-w-6xl gap-16 px-4 pt-16 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-14">
          {event.description && (
            <section>
              <h2 className="font-display text-3xl">About the event</h2>
              <p className="mt-4 whitespace-pre-line text-lg font-light leading-relaxed text-muted-foreground">{event.description}</p>
            </section>
          )}

          <section>
            <h2 className="font-display text-3xl">Good to know</h2>
            <ul className="mt-4 grid border-t sm:grid-cols-2 sm:gap-x-10">
              {['Doors open 30 minutes before the show', 'Show the QR on your phone, no printout needed', ...VENUE.amenities.slice(0, 4)].map((a) => (
                <li key={a} className="border-b py-3.5 text-sm">
                  {a}
                </li>
              ))}
            </ul>
          </section>

          {event.faqs.length > 0 && (
            <section>
              <h2 className="font-display text-3xl">FAQs</h2>
              <div className="mt-4 divide-y border-y">
                {event.faqs.map((f) => (
                  <details key={f.q} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                      {f.q}<span className="text-muted-foreground group-open:hidden">+</span><span className="hidden text-muted-foreground group-open:inline">−</span>
                    </summary>
                    <p className="mt-2 text-muted-foreground">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {where && (
            <section>
              <h2 className="font-display text-3xl">Venue</h2>
              <div className="mt-4 border">
                <iframe title={`Map of ${where}`} src={mapsEmbed(where)} className="h-64 w-full border-0 grayscale" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-semibold">{event.venue!.name}</p>
                    <p className="text-sm text-muted-foreground">{[event.venue!.address, event.venue!.city].filter(Boolean).join(', ')}</p>
                  </div>
                  {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm font-semibold text-primary">Directions →</a>}
                </div>
              </div>
            </section>
          )}

          {event.refund_policy && (
            <section className="flex gap-3 border-l-2 border-[#a3803f] bg-muted/50 p-5 text-sm">
              <p><span className="font-semibold">Refund policy. </span><span className="text-muted-foreground">{event.refund_policy}</span></p>
            </section>
          )}
        </div>

        {/* Tickets */}
        <aside aria-label="Tickets" className="lg:sticky lg:top-24 lg:self-start">
          <div className="border bg-card p-6">
            <h2 className="font-display text-2xl">Tickets</h2>
            <ul className="mt-4 divide-y border-y">
              {event.ticket_types.map((t, i) => {
                const left = available(t);
                const pct = t.capacity ? Math.round(((t.capacity - left) / t.capacity) * 100) : 100;
                return (
                  <li key={t.id} className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{t.name}</span>
                      <span className="font-display text-lg">{t.price_paise === 0 ? 'Free' : shortINR(t.price_paise)}</span>
                    </div>
                    {LABEL[states[i]] ? (
                      <p className="mt-2 text-xs font-semibold text-muted-foreground">{LABEL[states[i]]}</p>
                    ) : (
                      <>
                        <div className="mt-3 h-px bg-border">
                          <div className="h-px bg-foreground/60" style={{ width: `${pct}%` }} />
                        </div>
                        <p className={`mt-2 text-xs ${pct >= 60 ? 'text-primary' : 'text-muted-foreground'}`}>
                          {pct >= 60 ? `Only ${left} left` : `${left} available`}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {event.ticket_types.some((t) => t.gst_rate > 0) && (
              <p className="mt-3 text-xs text-muted-foreground">Prices exclude GST and booking fee, shown before payment.</p>
            )}
            {canBuy && (
              <Link href={checkout} className={buttonVariants({ size: 'lg', className: 'mt-6 hidden h-12 w-full rounded-sm text-xs uppercase tracking-[0.2em] lg:flex' })}>Get tickets</Link>
            )}
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">Secure payment by Zoho Payments · UPI, cards, net banking</p>
          </div>
        </aside>
      </div>

      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            {priceFrom && <span className="text-xs text-muted-foreground">from<span className="block font-display text-xl text-foreground">{priceFrom}</span></span>}
            <Link href={checkout} className={buttonVariants({ size: 'lg', className: 'h-11 flex-1 rounded-sm text-xs uppercase tracking-[0.2em]' })}>Get tickets</Link>
          </div>
        </div>
      )}
    </main>
  );
}
