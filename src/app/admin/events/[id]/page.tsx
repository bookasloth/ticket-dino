import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { requireMember } from '@/lib/auth';
import { paiseToRupeesInput } from '@/lib/money';
import { adminDb } from '@/lib/supabase/admin';
import { utcToIstInput } from '@/lib/time';
import { EventForm, type EventFormValues } from '../EventForm';
import { PosterForm } from './PosterForm';
import { StaffForm } from './StaffForm';
import { StatusButtons } from './StatusButtons';
import { TicketTypeForm, type TicketTypeValues } from './TicketTypeForm';
import { AddonForm, CouponForm, CouponList, type CouponRow } from './SellingForms';

type TT = { id: string; name: string; price_paise: number; gst_rate: number; capacity: number; sold_count: number; held_count: number;
  max_per_order: number; sale_starts_at: string; sale_ends_at: string; sort: number;
  group_min_qty: number | null; group_pct: number | null; unlocks_after_ticket_type_id: string | null };
type AddonRow = { id: string; name: string; price_paise: number; gst_rate: number; capacity: number; sold_count: number; max_per_order: number; sort: number };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { db, organizerId } = await requireMember();
  const { data: e } = await db
    .from('events')
    .select('*, venue:venues(*), ticket_types(*), addons(*), coupons(*)')
    .eq('id', id)
    .eq('organizer_id', organizerId)
    .maybeSingle();
  if (!e) notFound();

  const values: EventFormValues = {
    id: e.id, venue_id: e.venue_id, title: e.title, slug: e.slug, category: e.category ?? '', description: e.description ?? '',
    starts_at: utcToIstInput(e.starts_at), ends_at: utcToIstInput(e.ends_at),
    venue_name: e.venue?.name ?? '', venue_address: e.venue?.address ?? '', venue_city: e.venue?.city ?? '', maps_url: e.venue?.maps_url ?? '',
    fee_percent: String(e.fee_bps / 100), fee_flat: paiseToRupeesInput(e.fee_flat_paise), fee_gst_rate: String(e.fee_gst_rate),
    refund_policy: e.refund_policy ?? '', faqs: (e.faqs as { q: string; a: string }[]).map((f) => `${f.q} | ${f.a}`).join('\n'),
  };
  const ticketTypes = (e.ticket_types as TT[]).sort((a, b) => a.sort - b.sort);
  const toValues = (t: TT): TicketTypeValues => ({
    id: t.id, name: t.name, price: paiseToRupeesInput(t.price_paise), gst_rate: String(t.gst_rate), capacity: String(t.capacity),
    max_per_order: String(t.max_per_order), sale_starts_at: utcToIstInput(t.sale_starts_at), sale_ends_at: utcToIstInput(t.sale_ends_at),
    sort: String(t.sort), sold: t.sold_count, held: t.held_count,
    group_min_qty: t.group_min_qty === null ? '' : String(t.group_min_qty), group_pct: t.group_pct === null ? '' : String(t.group_pct),
    unlocks_after_ticket_type_id: t.unlocks_after_ticket_type_id ?? '',
  });
  const steps = ticketTypes.map((t) => ({ id: t.id, name: t.name }));
  const addons = (e.addons as AddonRow[]).sort((a, b) => a.sort - b.sort);
  const coupons = (e.coupons as CouponRow[]).sort((a, b) => a.code.localeCompare(b.code));
  const newTicketType: TicketTypeValues = {
    name: '', price: '', gst_rate: '18', capacity: '100', max_per_order: '10',
    sale_starts_at: utcToIstInput(new Date().toISOString()), sale_ends_at: utcToIstInput(e.starts_at), sort: String(ticketTypes.length + 1),
    group_min_qty: '', group_pct: '', unlocks_after_ticket_type_id: '',
  };

  const [{ data: staffRows }, { data: assigned }] = await Promise.all([
    db.from('organizer_members').select('user_id').eq('organizer_id', organizerId).eq('role', 'staff'),
    db.from('event_staff').select('user_id').eq('event_id', id),
  ]);
  const assignedIds = new Set((assigned ?? []).map((a) => a.user_id));
  const auth = adminDb().auth.admin;
  const staff = await Promise.all(
    (staffRows ?? []).map(async (r) => ({
      id: r.user_id as string,
      email: (await auth.getUserById(r.user_id)).data.user?.email ?? r.user_id,
      assigned: assignedIds.has(r.user_id),
    })),
  );

  return (
    <main className="space-y-10">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{e.title}</h1>
          <Badge variant={e.status === 'published' ? 'default' : 'secondary'}>{e.status}</Badge>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm underline">
          {e.status !== 'draft' && <Link href={`/e/${e.slug}`} target="_blank">View page</Link>}
          <Link href={`/admin/events/${e.id}/orders`}>Orders</Link>
          <a href={`/admin/events/${e.id}/export`}>Download attendees CSV</a>
          <Link href={`/scan/${e.id}`}>Open scanner</Link>
        </nav>
        <StatusButtons eventId={e.id} status={e.status} />
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ticket types</h2>
        {ticketTypes.map((t) => <TicketTypeForm key={t.id} eventId={e.id} values={toValues(t)} steps={steps} />)}
        <TicketTypeForm key={`new-${ticketTypes.length}`} eventId={e.id} values={newTicketType} steps={steps} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Coupons</h2>
        <CouponList eventId={e.id} coupons={coupons} />
        <CouponForm key={`cp-${coupons.length}`} eventId={e.id} ticketTypes={steps} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Extras (add-ons)</h2>
        {addons.map((a) => (
          <AddonForm key={a.id} eventId={e.id} values={{
            id: a.id, name: a.name, price: paiseToRupeesInput(a.price_paise), gst_rate: String(a.gst_rate),
            capacity: String(a.capacity), max_per_order: String(a.max_per_order), sold: a.sold_count,
          }} />
        ))}
        <AddonForm key={`new-${addons.length}`} eventId={e.id} values={{ name: '', price: '', gst_rate: '18', capacity: '100', max_per_order: '4' }} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Poster</h2>
        <PosterForm eventId={e.id} posterUrl={e.poster_url} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Gate staff</h2>
        <StaffForm eventId={e.id} staff={staff} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Details</h2>
        <EventForm values={values} />
      </section>
    </main>
  );
}
