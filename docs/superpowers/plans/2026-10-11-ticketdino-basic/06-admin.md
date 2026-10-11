# Part 6 — Admin: events and ticket types

### Task 14: Admin events, ticket types, poster and gate staff

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/events/actions.ts`, `src/app/admin/events/EventForm.tsx`, `src/app/admin/events/new/page.tsx`, `src/app/admin/events/[id]/page.tsx`, `src/app/admin/events/[id]/TicketTypeForm.tsx`, `src/app/admin/events/[id]/PosterForm.tsx`, `src/app/admin/events/[id]/StaffForm.tsx`, `src/app/admin/events/[id]/StatusButtons.tsx`

**Interfaces:**
- Consumes: `requireMember`, `adminDb` (storage + auth admin only), `rupeesToPaise`, `paiseToRupeesInput`, `istInputToUtcIso`, `utcToIstInput`, `formatIST`, `logout`.
- Produces: server actions `saveEvent`, `uploadPoster`, `setEventStatus`, `saveTicketType`, `deleteTicketType`, `setEventStaff`, each `(prev: ActionState, form: FormData) => Promise<ActionState>` with `ActionState = { error?: string; ok?: string } | null`. Pages `/admin`, `/admin/events/new`, `/admin/events/[id]`.

Admin writes go through the **user's** Supabase client, so RLS and column grants enforce permissions. `adminDb()` is used only for Storage uploads and to read staff emails.

- [ ] **Step 1: Server actions**

`src/app/admin/events/actions.ts`:
```ts
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
```

- [ ] **Step 2: Layout and events list**

`src/app/admin/layout.tsx`:
```tsx
import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { requireMember } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { db, organizerId, user } = await requireMember();
  const { data: org } = await db.from('organizers').select('name').eq('id', organizerId).single();
  return (
    <div>
      <div className="border-b bg-muted/40">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2 text-sm">
          <Link href="/admin" className="font-semibold">{org?.name ?? 'Admin'}</Link>
          <Link href="/scan">Scanner</Link>
          <span className="ml-auto hidden text-muted-foreground sm:inline">{user.email}</span>
          <form action={logout}><button className="underline">Sign out</button></form>
        </nav>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
```

`src/app/admin/page.tsx`:
```tsx
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireMember } from '@/lib/auth';
import { formatIST } from '@/lib/time';

export default async function AdminHome() {
  const { db, organizerId } = await requireMember();
  const { data: events } = await db
    .from('events')
    .select('id, title, status, starts_at, ticket_types(capacity, sold_count)')
    .eq('organizer_id', organizerId)
    .order('starts_at', { ascending: false });

  return (
    <main>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button asChild><Link href="/admin/events/new">New event</Link></Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Event</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Sold</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {(events ?? []).map((e) => {
            const tts = e.ticket_types as { capacity: number; sold_count: number }[];
            return (
              <TableRow key={e.id}>
                <TableCell><Link className="font-medium underline" href={`/admin/events/${e.id}`}>{e.title}</Link></TableCell>
                <TableCell>{formatIST(e.starts_at)}</TableCell>
                <TableCell><Badge variant={e.status === 'published' ? 'default' : 'secondary'}>{e.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {tts.reduce((n, t) => n + t.sold_count, 0)} / {tts.reduce((n, t) => n + t.capacity, 0)}
                </TableCell>
              </TableRow>
            );
          })}
          {!events?.length && (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No events yet.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </main>
  );
}
```

- [ ] **Step 3: Event form (create + edit)**

`src/app/admin/events/EventForm.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { saveEvent } from './actions';

export type EventFormValues = {
  id?: string; venue_id?: string | null; title: string; slug: string; category: string; description: string;
  starts_at: string; ends_at: string; venue_name: string; venue_address: string; venue_city: string; maps_url: string;
  fee_percent: string; fee_flat: string; fee_gst_rate: string; refund_policy: string; faqs: string;
};

const EMPTY: EventFormValues = {
  title: '', slug: '', category: '', description: '', starts_at: '', ends_at: '', venue_name: '', venue_address: '',
  venue_city: '', maps_url: '', fee_percent: '0', fee_flat: '0', fee_gst_rate: '18', refund_policy: '', faqs: '',
};

function Field({ label, name, hint, ...props }: { label: string; name: keyof EventFormValues; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EventForm({ values = EMPTY }: { values?: EventFormValues }) {
  const [state, action, pending] = useActionState(saveEvent, null);
  const v = values;
  return (
    <form action={action} className="space-y-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {v.venue_id && <input type="hidden" name="venue_id" value={v.venue_id} />}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" name="title" defaultValue={v.title} required />
        <Field label="URL" name="slug" defaultValue={v.slug} required pattern="[a-z0-9-]{3,60}" hint="ticketdino.in/e/<this>" />
        <Field label="Category" name="category" defaultValue={v.category} placeholder="Music, Comedy, Workshop…" />
        <div />
        <Field label="Starts (IST)" name="starts_at" type="datetime-local" defaultValue={v.starts_at} required />
        <Field label="Ends (IST)" name="ends_at" type="datetime-local" defaultValue={v.ends_at} required />
      </section>

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={6} defaultValue={v.description} />
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Venue name" name="venue_name" defaultValue={v.venue_name} required />
        <Field label="City" name="venue_city" defaultValue={v.venue_city} />
        <Field label="Address" name="venue_address" defaultValue={v.venue_address} />
        <Field label="Google Maps link" name="maps_url" type="url" defaultValue={v.maps_url} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Field label="Booking fee %" name="fee_percent" type="number" step="0.01" min="0" max="20" defaultValue={v.fee_percent} />
        <Field label="Booking fee ₹ per ticket" name="fee_flat" inputMode="decimal" defaultValue={v.fee_flat} />
        <Field label="GST on fee %" name="fee_gst_rate" type="number" step="0.01" min="0" max="40" defaultValue={v.fee_gst_rate} hint="Confirm with your CA" />
      </section>

      <div className="space-y-1">
        <Label htmlFor="faqs">FAQs</Label>
        <Textarea id="faqs" name="faqs" rows={4} defaultValue={v.faqs} placeholder="Is there parking? | Yes, paid parking at the venue." />
        <p className="text-xs text-muted-foreground">One per line: question | answer</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="refund_policy">Refund policy</Label>
        <Textarea id="refund_policy" name="refund_policy" rows={3} defaultValue={v.refund_policy} />
      </div>

      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : v.id ? 'Save changes' : 'Create event'}</Button>
    </form>
  );
}
```

`src/app/admin/events/new/page.tsx`:
```tsx
import { EventForm } from '../EventForm';

export default function NewEventPage() {
  return (
    <main>
      <h1 className="mb-6 text-2xl font-bold">New event</h1>
      <EventForm />
    </main>
  );
}
```

- [ ] **Step 4: Small client forms**

`src/app/admin/events/[id]/StatusButtons.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { setEventStatus } from '../actions';

export function StatusButtons({ eventId, status }: { eventId: string; status: string }) {
  const [state, action, pending] = useActionState(setEventStatus, null);
  const next = status === 'published' ? 'draft' : 'published';
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="status" value={next} />
      <Button type="submit" variant={next === 'published' ? 'default' : 'outline'} disabled={pending}>
        {next === 'published' ? 'Publish' : 'Unpublish'}
      </Button>
      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
      {state?.ok && <span className="text-sm text-green-700">{state.ok}</span>}
    </form>
  );
}
```

`src/app/admin/events/[id]/PosterForm.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadPoster } from '../actions';

export function PosterForm({ eventId, posterUrl }: { eventId: string; posterUrl: string | null }) {
  const [state, action, pending] = useActionState(uploadPoster, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="event_id" value={eventId} />
      {posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview, no optimization needed
        <img src={posterUrl} alt="Current poster" className="aspect-[1200/630] w-full max-w-md rounded-lg object-cover" />
      )}
      <div className="flex gap-2">
        <Input type="file" name="poster" accept="image/jpeg,image/png,image/webp" required aria-label="Poster image" />
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Uploading…' : 'Upload'}</Button>
      </div>
      <p className="text-xs text-muted-foreground">1200×630 works best for WhatsApp and Instagram previews. Max 5 MB.</p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
```

`src/app/admin/events/[id]/TicketTypeForm.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteTicketType, saveTicketType } from '../actions';

export type TicketTypeValues = {
  id?: string; name: string; price: string; gst_rate: string; capacity: string; max_per_order: string;
  sale_starts_at: string; sale_ends_at: string; sort: string; sold?: number; held?: number;
};

export function TicketTypeForm({ eventId, values }: { eventId: string; values: TicketTypeValues }) {
  const [state, action, pending] = useActionState(saveTicketType, null);
  const [delState, del, deleting] = useActionState(deleteTicketType, null);
  const v = values;
  const f = (name: keyof TicketTypeValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`${v.id ?? 'new'}-${name}`}>{label}</Label>
      <Input id={`${v.id ?? 'new'}-${name}`} name={name} defaultValue={String(v[name] ?? '')} required {...props} />
    </div>
  );
  return (
    <div className="rounded-lg border p-4">
      <form action={action} className="grid gap-3 sm:grid-cols-4">
        <input type="hidden" name="event_id" value={eventId} />
        {v.id && <input type="hidden" name="id" value={v.id} />}
        <div className="sm:col-span-2">{f('name', 'Name')}</div>
        {f('price', 'Price ₹ (excl. GST)', { inputMode: 'decimal' })}
        {f('gst_rate', 'GST %', { type: 'number', step: '0.01', min: 0, max: 40 })}
        {f('capacity', 'Capacity', { type: 'number', min: 0 })}
        {f('max_per_order', 'Max per order', { type: 'number', min: 1, max: 50 })}
        {f('sale_starts_at', 'Sale starts (IST)', { type: 'datetime-local' })}
        {f('sale_ends_at', 'Sale ends (IST)', { type: 'datetime-local' })}
        {f('sort', 'Order on page', { type: 'number', min: 0 })}
        <div className="flex items-end gap-2 sm:col-span-3">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : v.id ? 'Save' : 'Add ticket type'}</Button>
          {v.id && <span className="text-sm text-muted-foreground">{v.sold} sold · {v.held} on hold</span>}
        </div>
        {state?.error && <p className="text-sm text-destructive sm:col-span-4">{state.error}</p>}
        {state?.ok && <p className="text-sm text-green-700 sm:col-span-4">{state.ok}</p>}
      </form>
      {v.id && !v.sold && !v.held && (
        <form action={del} className="mt-2">
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="id" value={v.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={deleting}>Delete</Button>
          {delState?.error && <span className="text-sm text-destructive">{delState.error}</span>}
        </form>
      )}
    </div>
  );
}
```

`src/app/admin/events/[id]/StaffForm.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { setEventStaff } from '../actions';

export function StaffForm({ eventId, staff }: { eventId: string; staff: { id: string; email: string; assigned: boolean }[] }) {
  const [state, action, pending] = useActionState(setEventStaff, null);
  if (!staff.length) return <p className="text-sm text-muted-foreground">No gate staff accounts yet. Ask a super admin to add one (see README).</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="event_id" value={eventId} />
      {staff.map((s) => (
        <label key={s.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="user_id" value={s.id} defaultChecked={s.assigned} /> {s.email}
        </label>
      ))}
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>Save gate staff</Button>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
```

- [ ] **Step 5: Event edit page**

`src/app/admin/events/[id]/page.tsx`:
```tsx
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

type TT = { id: string; name: string; price_paise: number; gst_rate: number; capacity: number; sold_count: number; held_count: number;
  max_per_order: number; sale_starts_at: string; sale_ends_at: string; sort: number };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { db, organizerId } = await requireMember();
  const { data: e } = await db
    .from('events')
    .select('*, venue:venues(*), ticket_types(*)')
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
  });
  const newTicketType: TicketTypeValues = {
    name: '', price: '', gst_rate: '18', capacity: '100', max_per_order: '10',
    sale_starts_at: utcToIstInput(new Date().toISOString()), sale_ends_at: utcToIstInput(e.starts_at), sort: String(ticketTypes.length + 1),
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
        {ticketTypes.map((t) => <TicketTypeForm key={t.id} eventId={e.id} values={toValues(t)} />)}
        <TicketTypeForm key={`new-${ticketTypes.length}`} eventId={e.id} values={newTicketType} />
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
```

- [ ] **Step 5b: Pin the capacity error message** (Review Focus). Task 4 pgTAP already proves the DB rejects it with `23514`. Check by hand that the action maps this to friendly copy: on the seeded event, set General Admission capacity to `0` after one paid order → "Capacity can't be lower than tickets already sold or on hold."

- [ ] **Step 6: Verify by hand**

Run: `pnpm typecheck && pnpm dev`, sign in as `owner@ticketdino.test`.
1. `/admin` lists Dino Fest 2026 with sold/capacity.
2. New event: title "Test Night", URL `test-night`, starts tomorrow 19:00 and ends 23:00, venue "Blue Frog". It saves and redirects to the edit page.
3. Publish without ticket types → "Add at least one ticket type before publishing."
4. Add GA ₹299, capacity 50, then publish. `/e/test-night` shows it.
5. Upload a poster. It shows on the event page.
6. Tick `gate@ticketdino.test` under Gate staff and save.
7. Sign in as `gate@ticketdino.test` and visit `/admin` → redirected to `/scan`.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin
git commit -m "feat(admin): events, ticket types, poster upload, publish and gate staff"
```
