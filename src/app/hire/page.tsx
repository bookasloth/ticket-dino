import { Eyebrow, PageHero } from '@/components/PageHero';
import { VENUE } from '@/lib/venue';

export const metadata = { title: `Hire the hall · ${VENUE.name}` };

// ponytail: demo specs and rates; confirm with the venue before launch
const SPECS = [
  ['Seating', `${VENUE.stats[0].value} seats (stalls and balcony)`],
  ['Stage', '40 ft × 30 ft proscenium, wooden floor'],
  ['Sound', 'Line-array PA, 16-channel mixer, 6 wireless mics'],
  ['Lighting', 'DMX console, LED wash, profile spots'],
  ['Green rooms', 'Two, with mirrors and attached washrooms'],
  ['Projection', '4K projector with 20 ft screen'],
];

const PACKAGES = [
  { name: 'Half day', hours: '4 hours', price: '₹25,000', note: 'Ideal for recitals, school functions and talks.' },
  { name: 'Full day', hours: '9 hours', price: '₹45,000', note: 'Rehearsal plus evening performance. Most popular.' },
  { name: 'Festival', hours: '3 days', price: 'On request', note: 'Multi-day events, conferences and festivals.' },
];

export default function Hire() {
  const mail = `mailto:${VENUE.email}?subject=${encodeURIComponent('Hall booking enquiry')}`;
  return (
    <main>
      <PageHero
        eyebrow="Venue hire"
        title="Your event, on our stage"
        intro="Plays, concerts, annual days, award nights and conferences. A fully equipped auditorium with a team that has seen it all."
      />

      <section className="mx-auto grid max-w-6xl gap-16 px-4 py-20 md:grid-cols-[1fr_1.2fr]">
        <div>
          <Eyebrow>The hall</Eyebrow>
          <h2 className="mt-3 font-display text-4xl leading-tight">Technical specifications</h2>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            Every booking includes our in-house technician, housekeeping and front-of-house staff. Ticketing through this
            website is available for your event at no setup cost.
          </p>
        </div>
        <dl className="divide-y border-y">
          {SPECS.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-6 py-4 text-sm">
              <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-y bg-muted/60">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <Eyebrow>Packages</Eyebrow>
          <h2 className="mt-3 font-display text-4xl">Simple, transparent rates</h2>
          <div className="mt-12 grid gap-px border bg-border sm:grid-cols-3">
            {PACKAGES.map((p) => (
              <div key={p.name} className="bg-background p-8">
                <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{p.hours}</p>
                <h3 className="mt-3 font-display text-3xl">{p.name}</h3>
                <p className="mt-6 font-display text-4xl text-primary">{p.price}</p>
                {p.price.startsWith("₹") && <p className="mt-1 text-xs text-muted-foreground">plus GST</p>}
                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{p.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid items-center gap-10 border p-10 md:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="font-display text-4xl leading-tight">Check a date</h2>
            <p className="mt-3 text-muted-foreground">Tell us your preferred date, audience size and the kind of event. We reply within one working day.</p>
          </div>
          <div className="flex flex-col gap-3">
            <a href={mail} className="rounded-sm bg-primary px-7 py-3.5 text-center text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-primary/90">Email the booking office</a>
            <a href={`tel:${VENUE.phone.replace(/\s/g, '')}`} className="rounded-sm border px-7 py-3.5 text-center text-xs font-medium uppercase tracking-[0.2em] transition-colors hover:border-foreground">Call {VENUE.phone}</a>
          </div>
        </div>
      </section>
    </main>
  );
}
