import Link from 'next/link';
import { Eyebrow, PageHero } from '@/components/PageHero';
import { VENUE } from '@/lib/venue';

export const metadata = { title: `About · ${VENUE.name}` };

// ponytail: demo copy; replace with the venue's real history before launch
const MILESTONES = [
  { year: '1998', text: 'The hall opens its doors with a staging of a classic Marathi natak to a full house.' },
  { year: '2009', text: 'A complete renovation brings air-conditioning, new seating and a modern stage.' },
  { year: '2017', text: 'Professional sound and lighting installed; the hall begins hosting touring productions.' },
  { year: '2026', text: 'Online booking launches, so every seat can be reserved in under a minute.' },
];

const VALUES = [
  { title: 'Culture first', text: 'Natak, sangeet, nritya and the spoken word, programmed for every generation.' },
  { title: 'Open to all', text: 'Fair prices, student passes and free community events through the year.' },
  { title: 'A proper evening out', text: 'Comfortable seats, clear sound and an on-time curtain. Every time.' },
];

export default function About() {
  return (
    <main>
      <PageHero eyebrow="About the hall" title="A home for the performing arts" intro={VENUE.about} />

      <section className="mx-auto grid max-w-6xl gap-16 px-4 py-20 md:grid-cols-2">
        <div>
          <Eyebrow>Our story</Eyebrow>
          <h2 className="mt-3 font-display text-4xl leading-tight">More than two decades of curtain calls</h2>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            Named in honour of Chhayatai Nikhare, the sabhagruh was built so the city would always have a stage of its own.
            Generations of artists have taken their first bow here, and generations of families have made it part of their
            evenings, festivals and celebrations.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Today the hall hosts more than two hundred performances a year, from full-length Marathi plays to classical
            recitals, comedy nights, children&apos;s theatre and public talks.
          </p>
        </div>
        <ol className="border-l">
          {MILESTONES.map((m) => (
            <li key={m.year} className="relative pb-10 pl-8 last:pb-0">
              <span aria-hidden className="absolute -left-[3px] top-2.5 size-1.5 bg-[#a3803f]" />
              <span className="font-display text-3xl">{m.year}</span>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y bg-muted/60">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Eyebrow>What we stand for</Eyebrow>
          <div className="mt-10 grid gap-10 sm:grid-cols-3">
            {VALUES.map((v) => (
              <div key={v.title} className="border-t border-foreground/20 pt-6">
                <h3 className="font-display text-2xl">{v.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <dl className="grid gap-10 border-b pb-16 sm:grid-cols-3">
          {VENUE.stats.map((s) => (
            <div key={s.label}>
              <dd className="font-display text-6xl">{s.value}</dd>
              <dt className="mt-2 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-6">
          <p className="max-w-lg font-display text-3xl leading-snug">See what&apos;s on stage this season.</p>
          <div className="flex gap-4">
            <Link href="/#events" className="rounded-sm bg-primary px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-primary/90">View programme</Link>
            <Link href="/hire" className="rounded-sm border px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] transition-colors hover:border-foreground">Hire the hall</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
