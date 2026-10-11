import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const isLocal = /127\.0\.0\.1|localhost/.test(url);

describe.skipIf(!key || !isLocal)('inventory under concurrent load', () => {
  it('200 buyers racing for 50 seats → exactly 50 holds', async () => {
    const db = createClient(url, key, { auth: { persistSession: false } });
    const stamp = Date.now();
    const { data: org } = await db.from('organizers').insert({ name: 'Load', slug: `load-${stamp}` }).select().single();
    const { data: ev } = await db
      .from('events')
      .insert({
        organizer_id: org!.id, slug: `load-${stamp}`, title: 'Load', status: 'published',
        starts_at: new Date(Date.now() + 10 * 864e5).toISOString(),
        ends_at: new Date(Date.now() + 11 * 864e5).toISOString(),
      })
      .select().single();
    const { data: tt } = await db
      .from('ticket_types')
      .insert({
        organizer_id: org!.id, event_id: ev!.id, name: 'GA', price_paise: 1000, capacity: 50,
        max_per_order: 1, sale_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(),
      })
      .select().single();

    const attempts = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        db.rpc('create_order', {
          p_order: {
            event_id: ev!.id, buyer_name: `B${i}`, buyer_email: `b${i}@t.in`, buyer_phone: '+919876543210',
            subtotal_paise: 1000, fee_paise: 0, gst_paise: 0, total_paise: 1000,
          },
          p_items: [{ ticket_type_id: tt!.id, qty: 1, unit_price_paise: 1000, gst_rate: 18 }],
        }),
      ),
    );

    const failures = attempts.filter((a) => a.error);
    expect(attempts.length - failures.length).toBe(50);
    expect(failures.every((f) => f.error!.message.includes('UNAVAILABLE'))).toBe(true);

    const { data: after } = await db.from('ticket_types').select('sold_count, held_count, capacity').eq('id', tt!.id).single();
    expect(after).toEqual({ sold_count: 0, held_count: 50, capacity: 50 });
    const { count } = await db.from('orders').select('*', { count: 'exact', head: true }).eq('event_id', ev!.id);
    expect(count).toBe(50);
  }, 60_000);
});
