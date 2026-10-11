import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'TicketDino',
  description: 'Tickets for events across India.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${geist.variable} flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased`}>
        <header className="border-b">
          <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
            {/* ponytail: text logo until the real one lands */}
            <Link href="/" className="text-lg font-bold text-primary">TicketDino</Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t text-sm text-muted-foreground">
          <nav className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-2 px-4 py-6">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund-policy">Refunds &amp; cancellations</Link>
            <Link href="/contact">Contact</Link>
            <span className="ml-auto">© Timewheel Internet Pvt Ltd</span>
          </nav>
        </footer>
      </body>
    </html>
  );
}
