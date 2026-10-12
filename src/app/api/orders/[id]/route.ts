import { z } from 'zod';
import { adminDb } from '@/lib/supabase/admin';
import { safeEqual } from '@/lib/webhook';

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = new URL(req.url).searchParams.get('k') ?? '';
  if (!z.guid().safeParse(id).success) return notFound();

  const { data } = await adminDb()
    .from('orders')
    .select(`status, number, access_key, subtotal_paise, discount_paise, fee_paise, gst_paise, total_paise,
             event:events(title, slug, starts_at, ends_at, venue:venues(name, city)),
             order_items(qty, ticket_type:ticket_types(name)), order_addons(qty, addon:addons(name)),
             tickets(qr_token, created_at)`)
    .eq('id', id)
    .maybeSingle();
  if (!data || !safeEqual(data.access_key, key)) return notFound();

  const tickets = data.status === 'paid'
    ? (data.tickets as { qr_token: string; created_at: string }[])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((t) => t.qr_token)
    : [];
  const d = data as unknown as {
    event: { title: string; slug: string; starts_at: string; ends_at: string; venue: { name: string; city: string | null } | null };
    order_items: { qty: number; ticket_type: { name: string } }[];
    order_addons: { qty: number; addon: { name: string } }[];
  };
  return Response.json(
    {
      status: data.status, number: data.number, tickets,
      event: { title: d.event.title, slug: d.event.slug, startsAt: d.event.starts_at, endsAt: d.event.ends_at,
               venue: d.event.venue ? [d.event.venue.name, d.event.venue.city].filter(Boolean).join(', ') : null },
      lines: [
        ...d.order_items.map((i) => ({ name: i.ticket_type.name, qty: i.qty })),
        ...d.order_addons.map((a) => ({ name: a.addon.name, qty: a.qty })),
      ],
      amounts: { subtotal: data.subtotal_paise, discount: data.discount_paise, fee: data.fee_paise, gst: data.gst_paise, total: data.total_paise },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
