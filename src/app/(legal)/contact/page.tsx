import { Eyebrow, PageHero } from '@/components/PageHero';
import { mapsEmbed, VENUE } from '@/lib/venue';

export const metadata = { title: `Contact · ${VENUE.name}` };

export default function Contact() {
  const support = process.env.SUPPORT_EMAIL ?? 'support@example.com';
  const cards = [
    { label: 'Box office', value: VENUE.phone, href: `tel:${VENUE.phone.replace(/\s/g, '')}`, note: 'Daily, 10 am to 8 pm' },
    { label: 'Bookings & hire', value: VENUE.email, href: `mailto:${VENUE.email}`, note: 'Replies within one working day' },
    { label: 'Ticket support', value: support, href: `mailto:${support}`, note: 'Include your order number (TD-…)' },
  ];
  return (
    <main>
      <PageHero eyebrow="Contact" title="We'd love to hear from you" intro="Questions about a show, your tickets or hiring the hall? Reach the right team below." />

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-px border bg-border sm:grid-cols-3">
          {cards.map((c) => (
            <a key={c.label} href={c.href} className="group bg-background p-8">
              <Eyebrow>{c.label}</Eyebrow>
              <p className="mt-4 break-all font-display text-xl decoration-1 underline-offset-4 group-hover:underline">{c.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{c.note}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="grid border md:grid-cols-5">
          <div className="p-10 md:col-span-2">
            <Eyebrow>Find us</Eyebrow>
            <h2 className="mt-3 font-display text-3xl">{VENUE.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Main Auditorium, Nagpur</p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(VENUE.mapsQuery)}`} target="_blank" rel="noopener noreferrer"
               className="mt-8 inline-block border-b border-foreground pb-1 text-xs uppercase tracking-[0.2em]">Get directions</a>
            <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
              Online ticketing is operated by <span className="text-foreground">Timewheel Internet Pvt Ltd</span> (TicketDino) on behalf of the venue.
            </p>
          </div>
          <iframe title={`Map of ${VENUE.name}`} src={mapsEmbed(`${VENUE.mapsQuery} Nagpur`)} className="h-80 w-full border-0 grayscale md:col-span-3 md:h-full"
                  loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </section>
    </main>
  );
}
