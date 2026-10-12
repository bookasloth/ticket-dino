import { adminDb } from '@/lib/supabase/admin';
import { loadTicket, ticketVenue } from '@/lib/tickets/load';
import { renderTicketsPdf } from '@/lib/tickets/pdf';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = await loadTicket(adminDb(), (await params).token);
  if (!t) return new Response('Not found', { status: 404 });
  if (t.status === 'void') return new Response('This ticket is void', { status: 410 });
  const pdf = await renderTicketsPdf({
    orderNo: t.order.number,
    event: { title: t.event.title, slug: t.event.slug, startsAt: t.event.starts_at, venue: ticketVenue(t) },
    tickets: [{ token: t.qr_token, ticketType: t.ticket_type.name, attendeeName: t.attendee_name }],
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="ticket-TD-${t.order.number}.pdf"`,
      'x-robots-tag': 'noindex',
    },
  });
}
