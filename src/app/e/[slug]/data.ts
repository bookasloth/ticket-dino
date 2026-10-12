import { cache } from 'react';
import { publicDb } from '@/lib/supabase/public';

export type PublicTicketType = {
  id: string; name: string; price_paise: number; gst_rate: number; capacity: number; sold_count: number;
  held_count: number; max_per_order: number; sale_starts_at: string; sale_ends_at: string; sort: number;
  unlocks_after_ticket_type_id: string | null; group_min_qty: number | null; group_pct: number | null;
};
export type PublicAddon = { id: string; name: string; price_paise: number; gst_rate: number; capacity: number;
  sold_count: number; held_count: number; max_per_order: number; sort: number };
export type PublicEvent = {
  id: string; slug: string; title: string; category: string | null; description: string | null;
  faqs: { q: string; a: string }[]; poster_url: string | null; starts_at: string; ends_at: string;
  status: 'published' | 'cancelled' | 'completed';
  fee_bps: number; fee_flat_paise: number; fee_gst_rate: number; refund_policy: string | null;
  venue: { name: string; address: string | null; city: string | null; maps_url: string | null } | null;
  organizer: { name: string };
  ticket_types: PublicTicketType[];
  addons: PublicAddon[];
};

export const getPublicEvent = cache(async (slug: string): Promise<PublicEvent | null> => {
  const { data } = await publicDb()
    .from('events')
    .select(
      `id, slug, title, category, description, faqs, poster_url, starts_at, ends_at, status,
       fee_bps, fee_flat_paise, fee_gst_rate, refund_policy,
       venue:venues(name, address, city, maps_url), organizer:organizers(name),
       ticket_types(id, name, price_paise, gst_rate, capacity, sold_count, held_count, max_per_order,
                    sale_starts_at, sale_ends_at, sort, unlocks_after_ticket_type_id, group_min_qty, group_pct),
       addons(id, name, price_paise, gst_rate, capacity, sold_count, held_count, max_per_order, sort)`,
    )
    .eq('slug', slug)
    .neq('status', 'draft')
    .maybeSingle();
  if (!data) return null;
  const event = data as unknown as PublicEvent;
  // Price steps: hide a step until the one before it has no seats left.
  const full = new Set(event.ticket_types.filter((t) => t.sold_count + t.held_count >= t.capacity).map((t) => t.id));
  event.ticket_types = event.ticket_types
    .filter((t) => !t.unlocks_after_ticket_type_id || full.has(t.unlocks_after_ticket_type_id))
    .sort((a, b) => a.sort - b.sort);
  event.addons.sort((a, b) => a.sort - b.sort);
  return event;
});
