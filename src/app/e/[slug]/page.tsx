import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Check, Clock, MapPin, ShieldCheck, Ticket } from 'lucide-react';
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
    { icon: CalendarDays, label: 'Date', value: formatIST(event.starts_at, { dateStyle: 'full', timeStyle: undefined }) },
    { icon: Clock, label: 'Time', value: `${formatIST(event.starts_at, { dateStyle: undefined })} · ${hours % 1 ? hours.toFixed(1) : hours} hrs` },
    ...(where ? [{ icon: MapPin, label: 'Venue', value: where }] : []),
  ];

  return (
    <main className="pb-28 lg:pb-16">
      {/* Banner */}
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-red-800/40 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:py-14">
          {event.poster_url ? (
            <Image src={event.poster_url} alt={event.title} width={1200} height={630} priority
                   className="aspect-[4/3] w-full rounded-2xl object-cover shadow-2xl" sizes="(max-width: 768px) 100vw, 600px" />
          ) : (
            <PosterArt title={event.title} category={event.category} className="aspect-[4/3] rounded-2xl shadow-2xl" />
          )}
          <div>
            <nav className="text-sm text-white/60"><Link href="/#events" className="hover:text-white">Events</Link> / {event.category ?? 'Event'}</nav>
            {event.category && (
              <span className="mt-4 inline-block rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-300">{event.category}</span>
            )}
            <h1 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-5xl">{event.title}</h1>
            <p className="mt-2 text-white/70">Presented by {event.organizer.name}</p>
            <ul className="mt-6 space-y-3">
              {facts.map((f) => (
                <li key={f.label} className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10"><f.icon className="size-5 text-amber-300" /></span>
                  <span><span className="block text-xs uppercase tracking-wider text-white/50">{f.label}</span>{f.value}</span>
                </li>
              ))}
            </ul>
            {canBuy && (
              <div className="mt-8 flex items-center gap-5">
                <Link href={checkout} className="rounded-full bg-amber-400 px-7 py-3 font-semibold text-stone-950 hover:bg-amber-300">Get tickets</Link>
                {priceFrom && <span className="text-white/70">from <span className="text-xl font-semibold text-white">{priceFrom}</span></span>}
              </div>
            )}
          </div>
        </div>
      </section>

      {event.status === 'cancelled' && (
        <p className="mx-auto mt-6 max-w-6xl rounded-md bg-destructive/10 p-3 text-destructive">This event has been cancelled.</p>
      )}

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-10">
          {event.description && (
            <section>
              <h2 className="font-display text-2xl font-semibold">About the event</h2>
              <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-muted-foreground">{event.description}</p>
            </section>
          )}

          <section>
            <h2 className="font-display text-2xl font-semibold">Good to know</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {['Doors open 30 minutes before the show', 'Show the QR on your phone, no printout needed', ...VENUE.amenities.slice(0, 4)].map((a) => (
                <li key={a} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <Check className="size-4 shrink-0 text-primary" /> {a}
                </li>
              ))}
            </ul>
          </section>

          {event.faqs.length > 0 && (
            <section>
              <h2 className="font-display text-2xl font-semibold">FAQs</h2>
              <div className="mt-3 divide-y rounded-xl border">
                {event.faqs.map((f) => (
                  <details key={f.q} className="group p-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                      {f.q}<span className="text-primary transition group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-2 text-muted-foreground">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {where && (
            <section>
              <h2 className="font-display text-2xl font-semibold">Venue</h2>
              <div className="mt-3 overflow-hidden rounded-xl border">
                <iframe title={`Map of ${where}`} src={mapsEmbed(where)} className="h-64 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
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
            <section className="flex gap-3 rounded-xl bg-muted/60 p-4 text-sm">
              <ShieldCheck className="size-5 shrink-0 text-primary" />
              <p><span className="font-semibold">Refund policy. </span><span className="text-muted-foreground">{event.refund_policy}</span></p>
            </section>
          )}
        </div>

        {/* Tickets */}
        <aside aria-label="Tickets" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border bg-card p-5 shadow-lg">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Ticket className="size-5 text-primary" /> Tickets</h2>
            <ul className="mt-4 space-y-3">
              {event.ticket_types.map((t, i) => {
                const left = available(t);
                const pct = t.capacity ? Math.round(((t.capacity - left) / t.capacity) * 100) : 100;
                return (
                  <li key={t.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold">{t.name}</span>
                      <span className="font-semibold">{t.price_paise === 0 ? 'Free' : shortINR(t.price_paise)}</span>
                    </div>
                    {LABEL[states[i]] ? (
                      <p className="mt-2 text-xs font-semibold text-muted-foreground">{LABEL[states[i]]}</p>
                    ) : (
                      <>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${pct >= 60 ? 'bg-red-600' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className={`mt-1.5 text-xs ${pct >= 60 ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>
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
              <Link href={checkout} className={buttonVariants({ size: 'lg', className: 'mt-4 hidden h-12 w-full text-base lg:flex' })}>Get tickets</Link>
            )}
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Secure payment by Razorpay · UPI & cards</p>
          </div>
        </aside>
      </div>

      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-4 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            {priceFrom && <span className="text-sm text-muted-foreground">from<span className="block text-lg font-semibold text-foreground">{priceFrom}</span></span>}
            <Link href={checkout} className={buttonVariants({ size: 'lg', className: 'h-11 flex-1' })}>Get tickets</Link>
          </div>
        </div>
      )}
    </main>
  );
}
