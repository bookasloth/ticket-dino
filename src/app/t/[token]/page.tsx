import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { Badge } from '@/components/ui/badge';
import { adminDb } from '@/lib/supabase/admin';
import { loadTicket, ticketVenue } from '@/lib/tickets/load';
import { ticketUrl } from '@/lib/tickets/url';
import { formatIST } from '@/lib/time';

export const metadata: Metadata = { title: 'Your ticket · TicketDino', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await loadTicket(adminDb(), token); // token is a 128-bit secret: possession = access
  if (!t) notFound();
  const svg = await QRCode.toString(ticketUrl(t.qr_token), { type: 'svg', margin: 1 });
  const venue = ticketVenue(t);

  return (
    <main className="mx-auto max-w-sm px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">Order TD-{t.order.number}</p>
      <h1 className="mt-1 text-2xl font-bold">{t.event.title}</h1>
      <p className="mt-1">{formatIST(t.event.starts_at, { dateStyle: 'full' })}</p>
      {venue && <p className="text-muted-foreground">{venue}</p>}
      <p className="mt-4 font-medium">
        {t.ticket_type.name} · {t.attendee_name}
      </p>

      {t.status === 'void' ? (
        <p className="mt-6 rounded-md bg-destructive/10 p-4 text-destructive">This ticket is void (refunded or cancelled).</p>
      ) : (
        <>
          {/* qrcode output is trusted SVG generated on our server */}
          <div data-testid="ticket-qr" className="mx-auto mt-6 w-64 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
          {t.status === 'checked_in' && t.checked_in_at && (
            <Badge variant="secondary" className="mt-4">Checked in {formatIST(t.checked_in_at)}</Badge>
          )}
          <a className="mt-6 inline-block text-primary underline" href={`/t/${t.qr_token}/pdf`}>Download PDF</a>
        </>
      )}
    </main>
  );
}
