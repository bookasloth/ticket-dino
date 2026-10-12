import Link from 'next/link';
import { Eyebrow, PageHero } from '@/components/PageHero';
import { VENUE } from '@/lib/venue';

export const metadata = { title: `FAQ · ${VENUE.name}` };

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Booking',
    items: [
      ['How do I get my ticket?', 'Right after payment your e-ticket with a QR code is emailed to you and shown on the order page. No printout needed.'],
      ['Which payment methods work?', 'UPI (GPay, PhonePe, Paytm), debit and credit cards, and net banking, processed securely by Zoho Payments.'],
      ['My payment went through but I have no ticket.', 'UPI can take a few minutes to confirm. Check your order page or spam folder; if it is still missing after 15 minutes, contact us with your order number.'],
      ['Do you offer group or student discounts?', 'Many shows include a group discount for 6 or more tickets and a student price. Look for them at checkout. Coupon codes are entered on the checkout page.'],
    ],
  },
  {
    title: 'Your visit',
    items: [
      ['When should I arrive?', 'Doors open 30 minutes before the performance. Latecomers are seated at a suitable break.'],
      ['Is there parking?', 'Yes, complimentary two-wheeler and car parking inside the campus, on a first-come basis.'],
      ['Is the hall accessible?', 'Step-free entry at the main door and wheelchair spaces in the stalls. Tell us when booking and we will keep a space ready.'],
      ['Can I bring food inside?', 'Outside food is not allowed in the auditorium. Our canteen serves snacks and tea before the show and at the interval.'],
    ],
  },
  {
    title: 'Changes and refunds',
    items: [
      ['Can I cancel my ticket?', 'Refunds are available up to 3 days before the show, minus the booking fee. See the refund policy for details.'],
      ['What if a show is cancelled?', 'You receive a full refund automatically, including the booking fee.'],
    ],
  },
];

export default function Faq() {
  return (
    <main>
      <PageHero eyebrow="Help" title="Frequently asked questions" intro="Everything you need to know about booking, arriving and getting the most from your evening." />
      <div className="mx-auto grid max-w-6xl gap-16 px-4 py-20 md:grid-cols-[1fr_2fr]">
        <aside className="md:sticky md:top-28 md:self-start">
          <Eyebrow>Still need help?</Eyebrow>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Our box office is happy to help with bookings and visits.</p>
          <Link href="/contact" className="mt-6 inline-block border-b border-foreground pb-1 text-xs uppercase tracking-[0.2em]">Contact us</Link>
        </aside>
        <div className="space-y-14">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h2 className="font-display text-3xl">{g.title}</h2>
              <div className="mt-4 divide-y border-y">
                {g.items.map(([q, a]) => (
                  <details key={q} className="group py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6">
                      <span>{q}</span>
                      <span className="text-muted-foreground group-open:hidden">+</span>
                      <span className="hidden text-muted-foreground group-open:inline">−</span>
                    </summary>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
