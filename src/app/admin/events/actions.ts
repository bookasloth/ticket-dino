'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { rupeesToPaise } from '@/lib/money';
import { adminDb } from '@/lib/supabase/admin';
import { istInputToUtcIso } from '@/lib/time';

export type ActionState = { error?: string; ok?: string } | null;

const field = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0];
  return `${String(i.path[0] ?? '').replace(/_/g, ' ')}: ${i.message}`;
};

/** "Question | Answer" per line → [{ q, a }] */
function parseFaqs(text: string) {
  return text
    .split('\n')
    .map((line) => {
      const [q, ...rest] = line.split('|');
      return { q: q.trim(), a: rest.join('|').trim() };
    })
    .filter((f) => f.q && f.a);
}

function toUtc(local: string): string | null {
  try {
    return istInputToUtcIso(local);
  } catch {
    return null;
  }
}

const eventSchema = z.object({
  title: z.string().min(3).max(120),
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/, 'use 3–60 lowercase letters, numbers or dashes'),
  category: z.string().max(40),
  description: z.string().max(5000),
  starts_at: z.string(),
  ends_at: z.string(),
  venue_name: z.string().min(2).max(120),
  venue_address: z.string().max(300),
  venue_city: z.string().max(60),
  maps_url: z.union([z.literal(''), z.url()]),
  fee_percent: z.coerce.number().min(0).max(20),
  fee_flat: z.string(),
  fee_gst_rate: z.coerce.number().min(0).max(40),
  refund_policy: z.string().max(2000),
  faqs: z.string().max(5000),
});

export async function saveEvent(_: ActionState, form: FormData): Promise<ActionState> {
  const { db, organizerId } = await requireMember();
  const parsed = eventSchema.safeParse(Object.fromEntries(Object.keys(eventSchema.shape).map((k) => [k, field(form, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;

  const startsAt = toUtc(v.starts_at);
  const endsAt = toUtc(v.ends_at);
  if (!startsAt || !endsAt) return { error: 'Enter a valid start and end date and time.' };
  if (endsAt <= startsAt) return { error: 'The event must end after it starts.' };
  const feeFlat = v.fee_flat === '' ? 0 : rupeesToPaise(v.fee_flat);
  if (feeFlat === null) return { error: 'Flat booking fee must be an amount in rupees, e.g. 10 or 9.50.' };

  const id = field(form, 'id') || null;
  let venueId = field(form, 'venue_id') || null;
  const venue = {
    organizer_id: organizerId,
    name: v.venue_name,
    address: v.venue_address || null,
    city: v.venue_city || null,
    maps_url: v.maps_url || null,
  };
  if (venueId) {
    const { error } = await db.from('venues').update(venue).eq('id', venueId);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await db.from('venues').insert(venue).select('id').single();
    if (error) return { error: error.message };
    venueId = data.id;
  }

  const row = {
    organizer_id: organizerId,
    title: v.title,
    slug: v.slug,
    category: v.category || null,
    description: v.description || null,
    starts_at: startsAt,
    ends_at: endsAt,
    venue_id: venueId,
    fee_bps: Math.round(v.fee_percent * 100),
    fee_flat_paise: feeFlat,
    fee_gst_rate: v.fee_gst_rate,
    refund_policy: v.refund_policy || null,
    faqs: parseFaqs(v.faqs),
  };
  const res = id
    ? await db.from('events').update(row).eq('id', id).select('id, slug').single()
    : await db.from('events').insert(row).select('id, slug').single();
  if (res.error) return { error: res.error.code === '23505' ? 'That event URL is already taken.' : res.error.message };

  revalidatePath(`/e/${res.data.slug}`);
  revalidatePath('/admin');
  if (!id) redirect(`/admin/events/${res.data.id}`);
  return { ok: 'Saved.' };
}

/** Loads an event only if it belongs to the caller's organizer (RLS alone lets anyone read published events). */
async function ownEvent(eventId: string) {
  const ctx = await requireMember();
  const { data } = await ctx.db
    .from('events')
    .select('id, slug, organizer_id')
    .eq('id', eventId)
    .eq('organizer_id', ctx.organizerId)
    .maybeSingle();
  return { ...ctx, event: data };
}

export async function uploadPoster(_: ActionState, form: FormData): Promise<ActionState> {
  const { db, event } = await ownEvent(field(form, 'event_id'));
  if (!event) return { error: 'Event not found.' };
  const file = form.get('poster');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image.' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { error: 'Use a JPG, PNG or WebP image.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'The image must be under 5 MB.' };

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${event.organizer_id}/${event.id}-${Date.now()}.${ext}`;
  const storage = adminDb().storage.from('posters');
  const { error } = await storage.upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) return { error: error.message };

  const { error: updateError } = await db.from('events').update({ poster_url: storage.getPublicUrl(path).data.publicUrl }).eq('id', event.id);
  if (updateError) return { error: updateError.message };
  revalidatePath(`/e/${event.slug}`);
  revalidatePath(`/admin/events/${event.id}`);
  return { ok: 'Poster updated.' };
}

export async function setEventStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const { db, event } = await ownEvent(field(form, 'event_id'));
  if (!event) return { error: 'Event not found.' };
  const status = field(form, 'status');
  if (status !== 'draft' && status !== 'published') return { error: 'Unknown status.' };
  if (status === 'published') {
    const { count } = await db.from('ticket_types').select('id', { count: 'exact', head: true }).eq('event_id', event.id);
    if (!count) return { error: 'Add at least one ticket type before publishing.' };
  }
  const { error } = await db.from('events').update({ status }).eq('id', event.id);
  if (error) return { error: error.message };
  revalidatePath(`/e/${event.slug}`);
  revalidatePath(`/admin/events/${event.id}`);
  return { ok: status === 'published' ? 'Published. The event page is live.' : 'Unpublished.' };
}

const ticketTypeSchema = z.object({
  name: z.string().min(1).max(80),
  price: z.string(),
  gst_rate: z.coerce.number().min(0).max(40),
  capacity: z.coerce.number().int().min(0).max(1_000_000),
  max_per_order: z.coerce.number().int().min(1).max(50),
  sale_starts_at: z.string(),
  sale_ends_at: z.string(),
  sort: z.coerce.number().int().min(0).max(1000),
});

export async function saveTicketType(_: ActionState, form: FormData): Promise<ActionState> {
  const { db, organizerId, event } = await ownEvent(field(form, 'event_id'));
  if (!event) return { error: 'Event not found.' };
  const parsed = ticketTypeSchema.safeParse(Object.fromEntries(Object.keys(ticketTypeSchema.shape).map((k) => [k, field(form, k)])));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;
  const price = rupeesToPaise(v.price);
  if (price === null) return { error: 'Price must be an amount in rupees, e.g. 499 (use 0 for free).' };
  const saleStarts = toUtc(v.sale_starts_at);
  const saleEnds = toUtc(v.sale_ends_at);
  if (!saleStarts || !saleEnds) return { error: 'Enter valid sale start and end times.' };
  if (saleEnds <= saleStarts) return { error: 'Sales must end after they start.' };

  const row = {
    name: v.name, price_paise: price, gst_rate: v.gst_rate, capacity: v.capacity, max_per_order: v.max_per_order,
    sale_starts_at: saleStarts, sale_ends_at: saleEnds, sort: v.sort,
  };
  const id = field(form, 'id');
  const res = id
    ? await db.from('ticket_types').update(row).eq('id', id).eq('event_id', event.id).select('id')
    : await db.from('ticket_types').insert({ ...row, organizer_id: organizerId, event_id: event.id }).select('id');
  if (res.error) {
    if (res.error.code === '23514') return { error: "Capacity can't be lower than tickets already sold or on hold." };
    return { error: res.error.message };
  }
  if (!res.data?.length) return { error: "You can't edit this ticket type." };
  revalidatePath(`/e/${event.slug}`);
  revalidatePath(`/admin/events/${event.id}`);
  return { ok: 'Saved.' };
}

export async function deleteTicketType(_: ActionState, form: FormData): Promise<ActionState> {
  const { db, event } = await ownEvent(field(form, 'event_id'));
  if (!event) return { error: 'Event not found.' };
  const { data, error } = await db
    .from('ticket_types')
    .delete()
    .eq('id', field(form, 'id'))
    .eq('event_id', event.id)
    .eq('sold_count', 0)
    .eq('held_count', 0)
    .select('id');
  if (error?.code === '23503' || (!error && !data?.length)) {
    return { error: 'This ticket type already has orders. Set its capacity to the number sold to stop sales instead.' };
  }
  if (error) return { error: error.message };
  revalidatePath(`/admin/events/${event.id}`);
  return { ok: 'Deleted.' };
}

export async function setEventStaff(_: ActionState, form: FormData): Promise<ActionState> {
  const { db, organizerId, event } = await ownEvent(field(form, 'event_id'));
  if (!event) return { error: 'Event not found.' };
  const userIds = form.getAll('user_id').map(String);
  const { error } = await db.from('event_staff').delete().eq('event_id', event.id);
  if (error) return { error: error.message };
  if (userIds.length) {
    const { error: insertError } = await db
      .from('event_staff')
      .insert(userIds.map((user_id) => ({ organizer_id: organizerId, event_id: event.id, user_id })));
    if (insertError) return { error: insertError.message };
  }
  revalidatePath(`/admin/events/${event.id}`);
  return { ok: 'Gate staff updated.' };
}
