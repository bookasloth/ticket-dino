import { requireMember } from '@/lib/auth';
import { toCsv } from '@/lib/csv';
import { adminDb } from '@/lib/supabase/admin';
import { formatIST } from '@/lib/time';

type Row = {
  status: string; checked_in_at: string | null; attendee_name: string; attendee_email: string; attendee_phone: string;
  ticket_type: { name: string }; order: { number: number; created_at: string };
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, organizerId, user } = await requireMember();
  const { data: event } = await db.from('events').select('id, slug').eq('id', id).eq('organizer_id', organizerId).maybeSingle();
  if (!event) return new Response('Not found', { status: 404 });

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('tickets')
      .select('status, checked_in_at, attendee_name, attendee_email, attendee_phone, created_at, ticket_type:ticket_types(name), order:orders!inner(number, status, created_at)')
      .eq('event_id', id)
      .eq('order.status', 'paid')
      .order('created_at')
      .range(from, from + 999);
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }

  // Brief rule 10: every export is logged. No log → no export.
  const { error: logError } = await adminDb()
    .from('export_logs')
    .insert({ organizer_id: organizerId, event_id: id, user_id: user.id, kind: 'attendees_csv', row_count: rows.length });
  if (logError) return new Response('Could not log export', { status: 500 });

  const csv = toCsv([
    ['Order', 'Ticket type', 'Name', 'Email', 'Phone', 'Ticket status', 'Checked in (IST)', 'Ordered (IST)'],
    ...rows.map((r) => [
      `TD-${r.order.number}`, r.ticket_type.name, r.attendee_name, r.attendee_email, r.attendee_phone, r.status,
      r.checked_in_at ? formatIST(r.checked_in_at) : '', formatIST(r.order.created_at),
    ]),
  ]);
  return new Response('﻿' + csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="attendees-${event.slug}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
