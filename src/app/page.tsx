import Image from 'next/image';
import Link from 'next/link';
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
  return { price: !Number.isFinite(min) ? '' : min === 0 ? 'Free entry' : `From ${shortINR(min)}`, fill: cap ? sold / cap : 0 };
}

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => formatIST(iso, { dateStyle: undefined, timeStyle: undefined, ...o });
const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-[#a3803f]">{children}</p>
);

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
      <section className="bg-[#1a1412] text-[#f3ead8]">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.35em] text-[#c9a25c]">The {new Date().getFullYear()} season · {events.length} performances</p>
            <h1 className="mt-6 font-display text-5xl leading-[1.05] sm:text-7xl">{VENUE.name}</h1>
            <p className="mt-6 max-w-md text-base font-light leading-relaxed text-[#f3ead8]/70">
              {VENUE.tagline}{city ? `, in the heart of ${city}` : ''}. Reserve your seats online in under a minute.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="#events" className="rounded-sm bg-[#c9a25c] px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#1a1412] transition-colors hover:bg-[#d8b36e]">
                View programme
              </Link>
              <Link href="#venue" className="rounded-sm border border-[#f3ead8]/25 px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] transition-colors hover:border-[#f3ead8]/60">
                The venue
              </Link>
            </div>
            <dl className="mt-14 grid max-w-md grid-cols-3 border-t border-[#f3ead8]/15 pt-6">
              {VENUE.stats.map((s) => (
                <div key={s.label}>
                  <dd className="font-display text-3xl">{s.value}</dd>
                  <dt className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#f3ead8]/50">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {featured && (
            <Link href={`/e/${featured.slug}`} className="group block">
              <Poster e={featured} className="aspect-[4/5]" />
              <div className="mt-5 flex items-end justify-between gap-6 border-b border-[#f3ead8]/15 pb-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[#c9a25c]">Next performance</p>
                  <p className="mt-2 font-display text-2xl leading-snug">{featured.title}</p>
                  <p className="mt-1 text-sm font-light text-[#f3ead8]/60">{formatIST(featured.starts_at, { dateStyle: 'full', timeStyle: 'short' })}</p>
                </div>
                <span className="shrink-0 text-xs uppercase tracking-[0.2em] text-[#c9a25c] group-hover:underline">Reserve →</span>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* Programme */}
      <section id="events" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b pb-6">
          <div>
            <Eyebrow>What&apos;s on</Eyebrow>
            <h2 className="mt-3 font-display text-4xl">The programme</h2>
          </div>
          <nav aria-label="Filter by category" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] uppercase tracking-[0.15em]">
            {[undefined, ...categories].map((c) => (
              <Link
                key={c ?? 'all'}
                href={c ? `/?cat=${encodeURIComponent(c)}#events` : '/#events'}
                scroll={false}
                className={c === cat ? 'border-b border-primary pb-1 text-foreground' : 'pb-1 text-muted-foreground transition-colors hover:text-foreground'}
              >
                {c ?? 'All'}
              </Link>
            ))}
          </nav>
        </div>

        {shown.length === 0 && <p className="mt-10 text-muted-foreground">No upcoming events here right now.</p>}
        <ul className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => {
            const { price, fill } = stats(e);
            return (
              <li key={e.slug}>
                <Link href={`/e/${e.slug}`} className="group block">
                  <Poster e={e} className="aspect-[4/5]" />
                  <div className="mt-5 flex gap-5">
                    <div className="w-12 shrink-0 border-r pr-4 text-center">
                      <span className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{fmt(e.starts_at, { month: 'short' })}</span>
                      <span className="block font-display text-3xl leading-none">{fmt(e.starts_at, { day: 'numeric' })}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-xl leading-snug decoration-1 underline-offset-4 group-hover:underline">{e.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {fmt(e.starts_at, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <p className="mt-3 text-sm">
                        {price}
                        {fill >= 0.6 && <span className="ml-3 text-xs uppercase tracking-[0.15em] text-primary">Limited seats</span>}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works */}
      <section className="border-y bg-muted/60">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Eyebrow>Booking</Eyebrow>
          <h2 className="mt-3 font-display text-4xl">Three steps to your seat</h2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-3">
            {[
              { title: 'Choose a performance', text: 'Browse the programme and pick the seating that suits you.' },
              { title: 'Pay securely', text: 'UPI, cards and net banking through Zoho Payments. No account needed.' },
              { title: 'Arrive with your QR', text: 'Your e-ticket arrives by email instantly. Show it at the door.' },
            ].map((s, i) => (
              <li key={s.title} className="border-t border-foreground/20 pt-6">
                <span className="font-display text-5xl text-[#a3803f]">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-4 font-display text-xl">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Venue */}
      <section id="venue" className="mx-auto grid max-w-6xl scroll-mt-24 gap-16 px-4 py-20 md:grid-cols-2">
        <div>
          <Eyebrow>The venue</Eyebrow>
          <h2 className="mt-3 font-display text-4xl leading-tight">A stage with a story</h2>
          <p className="mt-6 leading-relaxed text-muted-foreground">{VENUE.about}</p>
        </div>
        <div>
          <ul className="divide-y border-y">
            {VENUE.amenities.map((a) => (
              <li key={a} className="flex items-center justify-between py-4 text-sm">
                {a}
                <span aria-hidden className="h-px w-6 bg-[#a3803f]" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-24">
        <div className="grid border md:grid-cols-5">
          <div className="p-10 md:col-span-2">
            <Eyebrow>Plan your visit</Eyebrow>
            <h2 className="mt-3 font-display text-3xl">{VENUE.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{city}</p>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">Doors open thirty minutes before every performance. Complimentary parking within the campus.</p>
            <dl className="mt-8 space-y-3 text-sm">
              <div><dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Box office</dt><dd>{VENUE.phone}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Email</dt><dd>{VENUE.email}</dd></div>
            </dl>
          </div>
          <iframe
            title={`Map of ${VENUE.name}`}
            src={mapsEmbed(`${VENUE.mapsQuery} ${city ?? ''}`)}
            className="h-80 w-full border-0 grayscale md:col-span-3 md:h-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </section>
    </main>
  );
}
