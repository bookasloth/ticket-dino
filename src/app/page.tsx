import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Check, MapPin, QrCode, Smartphone, Ticket } from 'lucide-react';
import { PosterArt } from '@/components/PosterArt';
import { publicDb } from '@/lib/supabase/public';
import { formatIST } from '@/lib/time';
import { mapsEmbed, shortINR, VENUE } from '@/lib/venue';

type Row = {
  slug: string; title: string; category: string | null; description: string | null; poster_url: string | null; starts_at: string;
  venue: { name: string; city: string | null } | null;
  ticket_types: { price_paise: number; capacity: number; sold_count: number }[];
};
type Props = { searchParams: Promise<{ cat?: string }> };

const Poster = ({ e, className }: { e: Row; className: string }) =>
  e.poster_url ? (
    <Image src={e.poster_url} alt="" width={1200} height={630} className={`${className} w-full object-cover`} />
  ) : (
    <PosterArt title={e.title} category={e.category} className={className} />
  );

function stats(e: Row) {
  const min = Math.min(...e.ticket_types.map((t) => t.price_paise));
  const cap = e.ticket_types.reduce((s, t) => s + t.capacity, 0);
  const sold = e.ticket_types.reduce((s, t) => s + t.sold_count, 0);
  return { price: !Number.isFinite(min) ? '' : min === 0 ? 'Free' : `From ${shortINR(min)}`, fill: cap ? sold / cap : 0 };
}

export default async function Home({ searchParams }: Props) {
  const { cat } = await searchParams;
  const { data } = await publicDb()
    .from('events')
    .select('slug, title, category, description, poster_url, starts_at, venue:venues(name, city), ticket_types(price_paise, capacity, sold_count)')
    .eq('status', 'published')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at');
  const events = (data ?? []) as unknown as Row[];
  const featured = events[0];
  const city = featured?.venue?.city;
  const categories = [...new Set(events.map((e) => e.category).filter(Boolean))] as string[];
  const shown = cat ? events.filter((e) => e.category === cat) : events;

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <div aria-hidden className="absolute -left-32 -top-32 size-[28rem] rounded-full bg-red-800/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 right-0 size-[30rem] rounded-full bg-amber-600/30 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-300">
              <span className="size-2 animate-pulse rounded-full bg-amber-400" /> Now booking · {events.length} shows
            </p>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-tight sm:text-6xl">{VENUE.name}</h1>
            <p className="mt-4 max-w-md text-lg text-white/75">
              {VENUE.tagline}{city ? `, in the heart of ${city}` : ''}. Book online in under a minute.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="#events" className="rounded-full bg-amber-400 px-6 py-3 font-semibold text-stone-950 hover:bg-amber-300">Browse events</Link>
              <Link href="#venue" className="rounded-full border border-white/30 px-6 py-3 font-semibold hover:bg-white/10">About the venue</Link>
            </div>
            <dl className="mt-10 flex gap-8">
              {VENUE.stats.map((s) => (
                <div key={s.label}>
                  <dt className="text-xs uppercase tracking-wider text-white/60">{s.label}</dt>
                  <dd className="font-display text-3xl font-semibold">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {featured && (
            <Link href={`/e/${featured.slug}`} className="group block rotate-1 transition hover:rotate-0">
              <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
                <Poster e={featured} className="aspect-[4/3]" />
                <div className="flex items-center justify-between gap-4 bg-white p-5 text-stone-900">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Next up</p>
                    <p className="mt-1 font-display text-xl font-semibold leading-snug">{featured.title}</p>
                    <p className="mt-1 text-sm text-stone-600">{formatIST(featured.starts_at, { dateStyle: 'full', timeStyle: 'short' })}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground group-hover:bg-primary/90">
                    Book
                  </span>
                </div>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* Events */}
      <section id="events" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">What&apos;s on</p>
            <h2 className="mt-1 font-display text-3xl font-semibold">Upcoming events</h2>
          </div>
          <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
            {[undefined, ...categories].map((c) => (
              <Link
                key={c ?? 'all'}
                href={c ? `/?cat=${encodeURIComponent(c)}#events` : '/#events'}
                scroll={false}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  c === cat ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary hover:text-primary'
                }`}
              >
                {c ?? 'All'}
              </Link>
            ))}
          </nav>
        </div>

        {shown.length === 0 && <p className="mt-8 text-muted-foreground">No upcoming events here right now. Check back soon.</p>}
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => {
            const { price, fill } = stats(e);
            const d = new Date(e.starts_at);
            return (
              <li key={e.slug}>
                <Link href={`/e/${e.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                  <div className="relative">
                    <Poster e={e} className="aspect-[16/10]" />
                    <div className="absolute right-3 top-3 rounded-xl bg-white px-3 py-1.5 text-center leading-none text-stone-900 shadow">
                      <span className="block text-[10px] font-bold uppercase text-primary">{formatIST(d, { month: 'short', dateStyle: undefined, timeStyle: undefined })}</span>
                      <span className="block font-display text-2xl font-semibold">{formatIST(d, { day: 'numeric', dateStyle: undefined, timeStyle: undefined })}</span>
                    </div>
                    {fill >= 0.6 && (
                      <span className="absolute left-3 top-3 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow">🔥 Filling fast</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="size-4" /> {formatIST(d, { weekday: 'short', hour: 'numeric', minute: '2-digit', dateStyle: undefined, timeStyle: undefined })}
                    </p>
                    <h3 className="mt-2 font-display text-lg font-semibold leading-snug group-hover:text-primary">{e.title}</h3>
                    {e.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{e.description}</p>}
                    <div className="mt-auto flex items-center justify-between pt-4">
                      <span className="font-semibold">{price}</span>
                      <span className="text-sm font-semibold text-primary">Book tickets →</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works */}
      <section className="bg-amber-50 dark:bg-stone-900">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-center font-display text-3xl font-semibold">Booking is this easy</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { icon: Ticket, title: 'Pick your show', text: 'Choose an event and the ticket type that suits you.' },
              { icon: Smartphone, title: 'Pay by UPI or card', text: 'Secure payment through Razorpay. GPay, PhonePe, Paytm and all cards.' },
              { icon: QrCode, title: 'Show your QR', text: 'Tickets land in your inbox instantly. Just scan at the gate.' },
            ].map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-background p-6 text-center shadow-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
                  <s.icon className="size-7" />
                </span>
                <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Step {i + 1}</p>
                <h3 className="mt-1 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Venue */}
      <section id="venue" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 px-4 py-16 md:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-gradient-to-br from-red-900 via-red-800 to-amber-700 p-8 text-white">
          {/* ponytail: stage illustration until real venue photos arrive */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-10 bg-[repeating-linear-gradient(90deg,#7f1d1d_0_24px,#991b1b_24px_48px)] shadow-lg" />
          <div aria-hidden className="absolute bottom-0 left-1/2 h-1/3 w-4/5 -translate-x-1/2 rounded-t-[50%] bg-amber-300/20" />
          <div className="relative flex h-full flex-col justify-end">
            <p className="font-display text-3xl font-semibold">{VENUE.stats[0].value} seats.</p>
            <p className="text-white/80">One unforgettable stage.</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">The venue</p>
          <h2 className="mt-1 font-display text-3xl font-semibold">About {VENUE.name}</h2>
          <p className="mt-4 text-muted-foreground">{VENUE.about}</p>
          <ul className="mt-6 grid grid-cols-2 gap-3">
            {VENUE.amenities.map((a) => (
              <li key={a} className="flex items-center gap-2 text-sm">
                <Check className="size-4 shrink-0 text-primary" /> {a}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16">
        <div className="grid overflow-hidden rounded-3xl border md:grid-cols-5">
          <div className="p-8 md:col-span-2">
            <h2 className="font-display text-2xl font-semibold">Plan your visit</h2>
            <p className="mt-4 flex gap-2 text-sm">
              <MapPin className="size-5 shrink-0 text-primary" /> {VENUE.name}{city ? `, ${city}` : ''}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Doors open 30 minutes before every show. Free parking inside the campus.</p>
            <p className="mt-6 text-sm"><span className="font-semibold">Box office:</span> {VENUE.phone}</p>
            <p className="text-sm"><span className="font-semibold">Email:</span> {VENUE.email}</p>
          </div>
          <iframe
            title={`Map of ${VENUE.name}`}
            src={mapsEmbed(`${VENUE.mapsQuery} ${city ?? ''}`)}
            className="h-72 w-full border-0 md:col-span-3 md:h-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>
    </main>
  );
}
