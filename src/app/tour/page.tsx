import Link from 'next/link';
import { Eyebrow, PageHero } from '@/components/PageHero';
import { VENUE } from '@/lib/venue';

export const metadata = { title: `Tour · ${VENUE.name}`, description: 'How booking works for the audience and the venue team.' };

type Step = { title: string; text: string; points?: string[]; href?: string; cta?: string };

const AUDIENCE: Step[] = [
  {
    title: 'Discover the season',
    text: 'The homepage shows every upcoming performance with date, starting price and a quiet "Limited seats" note when a show is filling up. Visitors can filter by Theatre, Music, Comedy and more.',
    href: '/#events', cta: 'Open the programme',
  },
  {
    title: 'Read about the show',
    text: 'Each event has its own page: poster, date and running time, venue map, FAQs, refund policy and every ticket type with live availability.',
    points: ['Group offers and extras shown up front', 'One tap to share on WhatsApp', 'Rich previews when the link is shared'],
    href: '/e/natak-sahi-re-sahi', cta: 'See an event page',
  },
  {
    title: 'Choose seats and extras',
    text: 'Pick ticket quantities, add parking or a snack combo, and apply a coupon. The total, GST and booking fee update instantly, with no surprises at the end.',
    points: ['Try coupon DIWALI20 in the demo', 'Early-bird prices switch automatically when sold out'],
    href: '/e/natak-sahi-re-sahi/checkout', cta: 'Try checkout',
  },
  {
    title: 'Pay in seconds',
    text: 'UPI (GPay, PhonePe, Paytm), cards and net banking through Zoho Payments. No account, no app download. Seats are held for 10 minutes while the buyer pays.',
  },
  {
    title: 'Receive the e-ticket',
    text: 'A confirmation page and an email arrive instantly with a QR code for every ticket, the order summary, and buttons to add the show to the calendar or tell friends on WhatsApp.',
  },
  {
    title: 'Walk in',
    text: 'At the door the QR is scanned from the phone screen. No printouts, and each code works exactly once, so screenshots cannot be reused.',
  },
];

const VENUE_TEAM: Step[] = [
  {
    title: 'Publish an event in minutes',
    text: 'Title, date, description, FAQs and a poster. Save it as a draft, publish when ready, and unpublish with one click.',
  },
  {
    title: 'Price it the way you want',
    text: 'As many ticket types as you need, each with its own price, GST rate, capacity, per-order limit and sale window.',
    points: ['Early-bird steps that unlock the next price automatically', 'Group discounts, e.g. 6+ tickets save 10%', 'Extras such as parking, snacks or a souvenir booklet'],
  },
  {
    title: 'Run promotions',
    text: 'Create coupon codes for festivals, members or sponsors. Percent or flat rupee off, optional cap, usage limit, expiry date, and limited to one ticket type if you like. Pause any code instantly.',
  },
  {
    title: 'Never oversell',
    text: 'Every seat, extra and coupon use is reserved inside the database the moment a buyer starts paying, and released if they do not finish. Two people can never buy the last seat.',
  },
  {
    title: 'See every order',
    text: 'Search by name, email, phone or order number. Open any order to see what was bought, what was paid, and every ticket with its scan status.',
    points: ['Mark refunds with a reason; tickets are voided and the buyer is emailed', 'Download the attendee list as CSV for the front desk'],
  },
  {
    title: 'Check in at the door',
    text: 'Gate staff log in on any phone and open the scanner. Green for valid, red for already used or refunded. Each staff member only sees the events they are assigned to.',
  },
  {
    title: 'Get paid',
    text: 'Payments settle to the venue bank account through Zoho Payments. If a buyer closes the tab right after paying, the system still finds the payment and issues tickets automatically.',
  },
];

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="divide-y border-y">
      {steps.map((s, i) => (
        <li key={s.title} className="grid gap-4 py-10 md:grid-cols-[6rem_1fr_14rem] md:gap-10">
          <span className="font-display text-5xl leading-none text-[#a3803f]">{String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3 className="font-display text-3xl leading-tight">{s.title}</h3>
            <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">{s.text}</p>
            {s.points && (
              <ul className="mt-4 space-y-1.5 text-sm">
                {s.points.map((p) => (
                  <li key={p} className="flex gap-3"><span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-[#a3803f]" />{p}</li>
                ))}
              </ul>
            )}
          </div>
          {s.href && (
            <Link href={s.href} className="self-start text-xs uppercase tracking-[0.2em] underline-offset-4 hover:underline md:text-right">
              {s.cta} →
            </Link>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function Tour() {
  return (
    <main>
      <PageHero
        eyebrow="Product tour"
        title="Online booking, from first click to the front door"
        intro="A walkthrough of what your audience sees and what your team controls. Every link on this page opens the working demo."
      />

      <nav className="border-b">
        <div className="mx-auto flex max-w-6xl gap-8 px-4 text-xs uppercase tracking-[0.2em]">
          <a href="#audience" className="border-b-2 border-transparent py-5 hover:border-primary">For the audience</a>
          <a href="#team" className="border-b-2 border-transparent py-5 hover:border-primary">For the venue team</a>
        </div>
      </nav>

      <section id="audience" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
        <Eyebrow>For the audience</Eyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-5xl leading-tight">Booking a seat takes under a minute</h2>
        <div className="mt-12"><Steps steps={AUDIENCE} /></div>
      </section>

      <section id="team" className="scroll-mt-24 bg-[#1a1412] text-[#f3ead8]">
        <div className="mx-auto max-w-6xl px-4 py-20 [&_.text-muted-foreground]:text-[#f3ead8]/60 [&_ol]:border-[#f3ead8]/15 [&_ol]:divide-[#f3ead8]/15">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-[#c9a25c]">For the venue team</p>
          <h2 className="mt-3 max-w-2xl font-display text-5xl leading-tight">Everything the box office needs, in one place</h2>
          <div className="mt-12"><Steps steps={VENUE_TEAM} /></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-px border bg-border sm:grid-cols-3">
          {[
            ['No app to install', 'Works in any phone browser, for buyers and for staff.'],
            ['No double bookings', 'Seats, extras and coupons are reserved atomically.'],
            ['Your brand, your data', 'Your name on every page, ticket and email. Export anytime.'],
          ].map(([t, d]) => (
            <div key={t} className="bg-background p-8">
              <h3 className="font-display text-2xl">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t pt-12">
          <p className="max-w-lg font-display text-4xl leading-tight">Ready to open the box office online?</p>
          <div className="flex gap-4">
            <Link href="/#events" className="rounded-sm bg-primary px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground transition-colors hover:bg-primary/90">Explore the demo</Link>
            <Link href="/contact" className="rounded-sm border px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] transition-colors hover:border-foreground">Talk to us</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
