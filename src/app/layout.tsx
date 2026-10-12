import type { Metadata } from 'next';
import Link from 'next/link';
import { Instrument_Serif, Poppins } from 'next/font/google';
import { VENUE } from '@/lib/venue';
import './globals.css';

const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-sans' });
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-display' });

const NAV = [['/#events', 'Programme'], ['/about', 'About'], ['/hire', 'Hire the hall'], ['/contact', 'Contact']] as const;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: `${VENUE.name} · Tickets`,
  description: VENUE.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${poppins.variable} ${instrument.variable} flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased`}>
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4">
            <Link href="/" className="whitespace-nowrap leading-tight">
              <span className="block font-display text-xl tracking-tight">{VENUE.name}</span>
              <span className="block text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Box office</span>
            </Link>
            <nav className="ml-auto hidden gap-8 whitespace-nowrap text-[13px] uppercase tracking-[0.15em] text-muted-foreground lg:flex">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="transition-colors hover:text-foreground">{label}</Link>
              ))}
            </nav>
            <details className="group relative ml-auto lg:hidden">
              <summary className="cursor-pointer list-none text-xs uppercase tracking-[0.2em] text-muted-foreground">Menu</summary>
              <nav className="absolute right-0 top-9 flex w-52 flex-col border bg-background py-2 text-sm shadow-sm">
                {NAV.map(([href, label]) => <Link key={href} href={href} className="px-5 py-2.5 hover:bg-muted">{label}</Link>)}
              </nav>
            </details>
            <Link href="/#events" className="shrink-0 rounded-sm bg-primary px-5 py-2.5 text-xs font-medium uppercase tracking-[0.15em] text-primary-foreground transition-colors hover:bg-primary/90">
              Book tickets
            </Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="bg-[#1a1412] text-sm text-stone-400">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:grid-cols-4">
            <div>
              <p className="font-display text-2xl text-[#f3ead8]">{VENUE.name}</p>
              <p className="mt-2">{VENUE.tagline}.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[#c9a25c]">Contact</p>
              <p className="mt-2">{VENUE.phone}</p>
              <p>{VENUE.email}</p>
            </div>
            <nav className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-[0.25em] text-[#c9a25c]">Explore</p>
              {NAV.map(([href, label]) => <Link key={href} href={href} className="hover:text-white">{label}</Link>)}
            </nav>
            <nav className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-[0.25em] text-[#c9a25c]">Help</p>
              <Link href="/tour" className="hover:text-white">Product tour</Link>
              <Link href="/faq" className="hover:text-white">FAQ</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/refund-policy" className="hover:text-white">Refunds &amp; cancellations</Link>
              <Link href="/contact" className="hover:text-white">Contact</Link>
            </nav>
          </div>
          <p className="border-t border-white/10 py-5 text-center text-xs tracking-wide">Ticketing powered by TicketDino · © Timewheel Internet Pvt Ltd</p>
        </footer>
      </body>
    </html>
  );
}
