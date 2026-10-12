import type { Metadata } from 'next';
import Link from 'next/link';
import { Fraunces, Geist } from 'next/font/google';
import { VENUE } from '@/lib/venue';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: `${VENUE.name} · Tickets`,
  description: VENUE.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${geist.variable} ${fraunces.variable} flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased`}>
        <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground">छ</span>
              <span className="leading-tight">
                <span className="block font-display text-base font-semibold">{VENUE.name}</span>
                <span className="block text-xs text-muted-foreground">Tickets by TicketDino</span>
              </span>
            </Link>
            <nav className="ml-auto hidden gap-6 text-sm font-medium md:flex">
              <Link href="/#events" className="hover:text-primary">Events</Link>
              <Link href="/#venue" className="hover:text-primary">The Venue</Link>
              <Link href="/#visit" className="hover:text-primary">Visit</Link>
            </nav>
            <Link href="/#events" className="ml-auto shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 md:ml-0">
              Book now
            </Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="bg-stone-950 text-sm text-stone-400">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
            <div>
              <p className="font-display text-lg text-white">{VENUE.name}</p>
              <p className="mt-2">{VENUE.tagline}.</p>
            </div>
            <div>
              <p className="font-semibold text-white">Contact</p>
              <p className="mt-2">{VENUE.phone}</p>
              <p>{VENUE.email}</p>
            </div>
            <nav className="flex flex-col gap-2">
              <p className="font-semibold text-white">Help</p>
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/refund-policy" className="hover:text-white">Refunds &amp; cancellations</Link>
              <Link href="/contact" className="hover:text-white">Contact</Link>
            </nav>
          </div>
          <p className="border-t border-stone-800 py-4 text-center text-xs">Ticketing powered by TicketDino · © Timewheel Internet Pvt Ltd</p>
        </footer>
      </body>
    </html>
  );
}
