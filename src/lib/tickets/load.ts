import type { SupabaseClient } from '@supabase/supabase-js';
import { isToken } from './url';

export type OrderEmailData = {
  orderNo: number;
  buyerName: string;
  totalPaise: number;
  organizerName: string;
  event: { title: string; slug: string; startsAt: string; venue: string | null };
  tickets: { token: string; ticketType: string; attendeeName: string }[];
};

type Venue = { name: string; city: string | null } | null;
const venueLabel = (v: Venue) => (v ? [v.name, v.city].filter(Boolean).join(', ') : null);

export async function loadOrderEmailData(db: SupabaseClient, orderId: string): Promise<OrderEmailData> {
  const { data, error } = await db
    .from('orders')
    .select(
      `number, buyer_name, total_paise,
       event:events(title, slug, starts_at, venue:venues(name, city), organizer:organizers(name)),
       tickets(qr_token, attendee_name, created_at, ticket_type:ticket_types(name))`,
    )
    .eq('id', orderId)
    .single();
  if (error || !data) throw new Error(`order ${orderId} not found: ${error?.message}`);
  const row = data as unknown as {
    number: number; buyer_name: string; total_paise: number;
    event: { title: string; slug: string; starts_at: string; venue: Venue; organizer: { name: string } };
    tickets: { qr_token: string; attendee_name: string; created_at: string; ticket_type: { name: string } }[];
  };
  return {
    orderNo: row.number,
    buyerName: row.buyer_name,
    totalPaise: row.total_paise,
    organizerName: row.event.organizer.name,
    event: { title: row.event.title, slug: row.event.slug, startsAt: row.event.starts_at, venue: venueLabel(row.event.venue) },
    tickets: row.tickets
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((t) => ({ token: t.qr_token, ticketType: t.ticket_type.name, attendeeName: t.attendee_name })),
  };
}

export type TicketView = {
  qr_token: string;
  status: 'valid' | 'void' | 'checked_in';
  attendee_name: string;
  checked_in_at: string | null;
  ticket_type: { name: string };
  order: { number: number };
  event: { title: string; slug: string; starts_at: string; venue: Venue };
};

export async function loadTicket(db: SupabaseClient, token: string): Promise<TicketView | null> {
  if (!isToken(token)) return null;
  const { data } = await db
    .from('tickets')
    .select(
      `qr_token, status, attendee_name, checked_in_at, ticket_type:ticket_types(name), order:orders(number),
       event:events(title, slug, starts_at, venue:venues(name, city))`,
    )
    .eq('qr_token', token)
    .maybeSingle();
  return (data as unknown as TicketView) ?? null;
}

export const ticketVenue = (t: TicketView) => venueLabel(t.event.venue);
