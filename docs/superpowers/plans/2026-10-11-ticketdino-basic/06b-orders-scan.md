# Part 6b — Orders, refunds, CSV and scanner

### Task 15: Orders list, order detail, manual refund, attendee CSV

**Files:**
- Create: `src/app/admin/events/[id]/orders/page.tsx`, `src/app/admin/orders/[id]/page.tsx`, `src/app/admin/orders/[id]/RefundForm.tsx`, `src/app/admin/orders/[id]/actions.ts`, `src/app/admin/events/[id]/export/route.ts`

**Interfaces:**
- Consumes: `requireMember`, `adminDb` (export log insert only), `toCsv`, `formatINR`, `formatIST`, `sendPendingNotifications`, `report`; SQL `mark_order_refunded`.
- Produces: `/admin/events/[id]/orders?q=&status=`, `/admin/orders/[id]`, `markRefunded(prev: ActionState, form: FormData)`, `GET /admin/events/[id]/export` (CSV, logged to `export_logs`).

- [ ] **Step 1: Orders list with search**

`src/app/admin/events/[id]/orders/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireMember } from '@/lib/auth';
import { formatINR } from '@/lib/money';
import { formatIST } from '@/lib/time';

const STATUSES = ['paid', 'pending', 'failed', 'expired', 'refunded'];

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string }> };

export default async function OrdersPage({ params, searchParams }: Props) {
  const [{ id }, { q = '', status = '' }] = await Promise.all([params, searchParams]);
  if (!z.guid().safeParse(id).success) notFound();
  const { db, organizerId } = await requireMember();
  const { data: event } = await db.from('events').select('id, title').eq('id', id).eq('organizer_id', organizerId).maybeSingle();
  if (!event) notFound();

  let query = db
    .from('orders')
    .select('id, number, buyer_name, buyer_email, buyer_phone, total_paise, status, created_at')
    .eq('event_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (STATUSES.includes(status)) query = query.eq('status', status);

  const term = q.trim();
  const orderNo = term.match(/^td-?(\d+)$/i);
  if (orderNo) query = query.eq('number', Number(orderNo[1]));
  else if (z.guid().safeParse(term).success) query = query.eq('id', term);
  else if (term) {
    // Strip characters that have meaning in PostgREST filter syntax before building the OR filter.
    const safe = term.replace(/[^\w@.+\- ]/g, '');
    if (safe) {
      query = query.or(
        [`buyer_name.ilike."%${safe}%"`, `buyer_email.ilike."%${safe}%"`, `buyer_phone.ilike."%${safe}%"`,
         `razorpay_order_id.eq."${safe}"`, `razorpay_payment_id.eq."${safe}"`].join(','),
      );
    }
  }
  const [{ data: orders }, { data: paid }] = await Promise.all([
    query,
    db.from('orders').select('total_paise').eq('event_id', id).eq('status', 'paid'),
  ]);
  const revenue = (paid ?? []).reduce((n, o) => n + o.total_paise, 0);

  return (
    <main className="space-y-4">
      <Link href={`/admin/events/${id}`} className="text-sm underline">← {event.title}</Link>
      <h1 className="text-2xl font-bold">Orders</h1>
      <p className="text-sm text-muted-foreground">{paid?.length ?? 0} paid orders · {formatINR(revenue)} collected (incl. fees and GST)</p>
      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Name, phone, email, TD-123 or Razorpay id" className="max-w-sm" />
        <select name="status" defaultValue={status} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Order</TableHead><TableHead>Buyer</TableHead><TableHead>Phone</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Placed</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {(orders ?? []).map((o) => (
            <TableRow key={o.id}>
              <TableCell><Link className="underline" href={`/admin/orders/${o.id}`}>TD-{o.number}</Link></TableCell>
              <TableCell>{o.buyer_name}<div className="text-xs text-muted-foreground">{o.buyer_email}</div></TableCell>
              <TableCell>{o.buyer_phone}</TableCell>
              <TableCell>{formatINR(o.total_paise)}</TableCell>
              <TableCell><Badge variant={o.status === 'paid' ? 'default' : 'secondary'}>{o.status}</Badge></TableCell>
              <TableCell>{formatIST(o.created_at)}</TableCell>
            </TableRow>
          ))}
          {!orders?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No orders found.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </main>
  );
}
```

- [ ] **Step 2: Refund action and form**

`src/app/admin/orders/[id]/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import type { ActionState } from '@/app/admin/events/actions';
import { requireMember } from '@/lib/auth';
import { sendPendingNotifications } from '@/lib/email/send';
import { report } from '@/lib/report';

export async function markRefunded(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireMember();
  const orderId = String(form.get('order_id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason) return { error: 'Add a reason for the refund.' };
  if (form.get('confirm') !== 'on') return { error: 'Confirm that you have already refunded this payment in the Razorpay dashboard.' };

  const { error } = await db.rpc('mark_order_refunded', { p_order_id: orderId, p_reason: reason.slice(0, 500) });
  if (error) {
    if (error.message.includes('NOT_PAID')) return { error: 'Only paid orders can be marked refunded.' };
    if (error.message.includes('FORBIDDEN')) return { error: "You don't have permission to refund this order." };
    return { error: error.message };
  }
  after(() => sendPendingNotifications(orderId).catch((e) => report(e, { orderId })));
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: 'Marked refunded. The tickets are void and the buyer is being emailed.' };
}
```

`src/app/admin/orders/[id]/RefundForm.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { markRefunded } from './actions';

export function RefundForm({ orderId, amount }: { orderId: string; amount: string }) {
  const [state, action, pending] = useActionState(markRefunded, null);
  if (state?.ok) return <p className="text-sm text-green-700">{state.ok}</p>;
  return (
    <form action={action} className="space-y-3 rounded-lg border border-destructive/40 p-4">
      <h2 className="font-semibold">Mark as refunded</h2>
      <p className="text-sm text-muted-foreground">
        First refund {amount} in the Razorpay dashboard. Then record it here: every ticket on this order is voided and the buyer gets an email.
      </p>
      <input type="hidden" name="order_id" value={orderId} />
      <div className="space-y-1">
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" name="reason" rows={2} required maxLength={500} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1" required />
        I have already refunded {amount} in the Razorpay dashboard.
      </label>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" variant="destructive" disabled={pending}>{pending ? 'Saving…' : 'Mark refunded'}</Button>
    </form>
  );
}
```

- [ ] **Step 3: Order detail page**

`src/app/admin/orders/[id]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { requireMember } from '@/lib/auth';
import { formatINR } from '@/lib/money';
import { formatIST } from '@/lib/time';
import { RefundForm } from './RefundForm';

type Order = {
  id: string; number: number; organizer_id: string; status: string; buyer_name: string; buyer_email: string; buyer_phone: string;
  subtotal_paise: number; fee_paise: number; gst_paise: number; total_paise: number; razorpay_order_id: string | null;
  razorpay_payment_id: string | null; created_at: string; paid_at: string | null;
  event: { id: string; title: string };
  order_items: { qty: number; unit_price_paise: number; ticket_type: { name: string } }[];
  tickets: { id: string; qr_token: string; status: string; checked_in_at: string | null; ticket_type: { name: string } }[];
  refunds: { amount_paise: number; reason: string | null; status: string; created_at: string; razorpay_refund_id: string | null }[];
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { db, organizerId } = await requireMember();
  const { data } = await db
    .from('orders')
    .select(`*, event:events(id, title), order_items(qty, unit_price_paise, ticket_type:ticket_types(name)),
             tickets(id, qr_token, status, checked_in_at, ticket_type:ticket_types(name)),
             refunds(amount_paise, reason, status, created_at, razorpay_refund_id)`)
    .eq('id', id)
    .maybeSingle();
  const o = data as Order | null;
  if (!o || o.organizer_id !== organizerId) notFound();

  return (
    <main className="space-y-6">
      <Link href={`/admin/events/${o.event.id}/orders`} className="text-sm underline">← Orders for {o.event.title}</Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">TD-{o.number}</h1>
        <Badge>{o.status}</Badge>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Buyer</dt><dd>{o.buyer_name}</dd>
        <dt className="text-muted-foreground">Email</dt><dd>{o.buyer_email}</dd>
        <dt className="text-muted-foreground">Phone</dt><dd>{o.buyer_phone}</dd>
        <dt className="text-muted-foreground">Placed</dt><dd>{formatIST(o.created_at)}</dd>
        {o.paid_at && <><dt className="text-muted-foreground">Paid</dt><dd>{formatIST(o.paid_at)}</dd></>}
        <dt className="text-muted-foreground">Razorpay</dt><dd>{o.razorpay_order_id ?? '—'} / {o.razorpay_payment_id ?? '—'}</dd>
      </dl>

      <section>
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="text-sm">
          {o.order_items.map((i, n) => <li key={n}>{i.qty} × {i.ticket_type.name} @ {formatINR(i.unit_price_paise)}</li>)}
        </ul>
        <p className="mt-2 text-sm">
          Subtotal {formatINR(o.subtotal_paise)} · Fee {formatINR(o.fee_paise)} · GST {formatINR(o.gst_paise)} ·{' '}
          <strong>Total {formatINR(o.total_paise)}</strong>
        </p>
      </section>

      {o.tickets.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Tickets</h2>
          <ul className="space-y-1 text-sm">
            {o.tickets.map((t) => (
              <li key={t.id}>
                <a className="underline" href={`/t/${t.qr_token}`} target="_blank">{t.ticket_type.name}</a> · {t.status}
                {t.checked_in_at && ` at ${formatIST(t.checked_in_at)}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {o.refunds.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Refunds</h2>
          <ul className="text-sm">
            {o.refunds.map((r, n) => (
              <li key={n}>{formatINR(r.amount_paise)} · {r.status} · {formatIST(r.created_at)}{r.reason ? ` · ${r.reason}` : ''}</li>
            ))}
          </ul>
        </section>
      )}

      {o.status === 'paid' && <RefundForm orderId={o.id} amount={formatINR(o.total_paise)} />}
    </main>
  );
}
```

- [ ] **Step 4: Attendee CSV export**

`src/app/admin/events/[id]/export/route.ts`:
```ts
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
```
QR tokens are deliberately left out of the CSV. A leaked export must not be usable to get into the event.

- [ ] **Step 5: Verify by hand**

Run: `pnpm typecheck && pnpm dev`. As the owner, with the paid order from Task 12:
1. Orders page lists it. Search finds it by `TD-<n>`, by part of the email, and by the last 4 digits of the phone.
2. The order page shows items, tickets and the fee/GST split.
3. Submit Mark refunded without ticking the box → the browser blocks it. Then fill in a reason, tick the box and submit → success. The ticket page shows "void", and `select template, status from notifications order by created_at desc limit 1` → `refund`.
4. Download the CSV and open it in Excel: the Hindi/₹ characters display correctly (BOM), and there is one `export_logs` row.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin
git commit -m "feat(admin): order search, order detail, manual refunds and logged CSV export"
```

---

### Task 16: Gate scanner

**Files:**
- Create: `src/app/scan/page.tsx`, `src/app/scan/[eventId]/page.tsx`, `src/app/scan/[eventId]/Scanner.tsx`, `src/app/api/scan/route.ts`

**Interfaces:**
- Consumes: `requireMember(['owner','manager','staff'])`, `userDb`, `tokenFromScan`, `formatIST`, `report`; SQL `check_in`, `can_scan_event`.
- Produces: `/scan` (event picker), `/scan/[eventId]` (camera scanner), and `POST /api/scan { token, eventId }`, which returns the `check_in` JSON (or `{ result: 'forbidden' }` with 403, or `{ result: 'error' }` with 500).

- [ ] **Step 1: Scan API**

`src/app/api/scan/route.ts`:
```ts
import { z } from 'zod';
import { report } from '@/lib/report';
import { userDb } from '@/lib/supabase/server';

const body = z.object({ token: z.string().min(1).max(200), eventId: z.guid() });

// One RPC round trip keeps scan-to-result well under 1 s. check_in is atomic: two devices scanning the
// same QR at once get exactly one "ok".
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ result: 'not_found' }, { status: 400 });
  const db = await userDb();
  const { data, error } = await db.rpc('check_in', { p_token: parsed.data.token, p_event_id: parsed.data.eventId });
  if (error) {
    const forbidden = error.message.includes('FORBIDDEN');
    if (!forbidden) report(error, { route: 'scan' });
    return Response.json({ result: forbidden ? 'forbidden' : 'error' }, { status: forbidden ? 403 : 500 });
  }
  return Response.json(data);
}
```

- [ ] **Step 2: Event picker and scanner page**

`src/app/scan/page.tsx`:
```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import { formatIST } from '@/lib/time';

export const metadata: Metadata = { title: 'Scanner · TicketDino', robots: { index: false } };
export const dynamic = 'force-dynamic';

type Ev = { id: string; title: string; starts_at: string; ends_at: string; status: string };

export default async function ScanHome() {
  const { db, user, role, organizerId } = await requireMember(['owner', 'manager', 'staff']);
  let events: Ev[];
  if (role === 'staff') {
    const { data } = await db.from('event_staff').select('event:events(id, title, starts_at, ends_at, status)').eq('user_id', user.id);
    events = (data ?? []).map((r) => r.event as unknown as Ev);
  } else {
    const { data } = await db.from('events').select('id, title, starts_at, ends_at, status').eq('organizer_id', organizerId);
    events = (data ?? []) as Ev[];
  }
  const cutoff = Date.now() - 12 * 3_600_000;
  events = events
    .filter((e) => e.status === 'published' && new Date(e.ends_at).getTime() > cutoff)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="mb-4 text-xl font-bold">Choose an event to scan</h1>
      {events.length === 0 && <p className="text-muted-foreground">No upcoming events are assigned to you. Ask the organizer to add you as gate staff.</p>}
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/scan/${e.id}`} className="block rounded-lg border p-4">
              <div className="font-medium">{e.title}</div>
              <div className="text-sm text-muted-foreground">{formatIST(e.starts_at)}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

`src/app/scan/[eventId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { Scanner } from './Scanner';

export const dynamic = 'force-dynamic';

export default async function ScanEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!z.guid().safeParse(eventId).success) notFound();
  const { db } = await requireMember(['owner', 'manager', 'staff']);
  const { data: allowed } = await db.rpc('can_scan_event', { p_event_id: eventId });
  if (!allowed) notFound();
  const { data: event } = await db.from('events').select('id, title').eq('id', eventId).single();
  if (!event) notFound();
  return <Scanner eventId={event.id} title={event.title} />;
}
```

- [ ] **Step 3: Scanner client**

`src/app/scan/[eventId]/Scanner.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tokenFromScan } from '@/lib/tickets/url';
import { formatIST } from '@/lib/time';

type Result = {
  result: 'ok' | 'already_used' | 'wrong_event' | 'void' | 'not_found' | 'forbidden' | 'error';
  attendee_name?: string;
  ticket_type?: string;
  checked_in_at?: string;
  checked_in_by?: string;
};
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function describe(r: Result): { ok: boolean; title: string; detail?: string } {
  switch (r.result) {
    case 'ok':
      return { ok: true, title: 'Valid ✓', detail: [r.attendee_name, r.ticket_type].filter(Boolean).join(' · ') };
    case 'already_used':
      return {
        ok: false,
        title: 'Already scanned',
        detail: [r.checked_in_at && formatIST(r.checked_in_at, { dateStyle: undefined, timeStyle: 'medium' }), r.checked_in_by && `by ${r.checked_in_by}`]
          .filter(Boolean).join(' '),
      };
    case 'wrong_event': return { ok: false, title: 'Wrong event', detail: 'This ticket is for a different event.' };
    case 'void': return { ok: false, title: 'Void ticket', detail: 'Refunded or cancelled.' };
    case 'not_found': return { ok: false, title: 'Not a valid ticket' };
    case 'forbidden': return { ok: false, title: 'Not allowed', detail: "You aren't assigned to this event." };
    default: return { ok: false, title: 'Network error', detail: 'Scan again.' };
  }
}

export function Scanner({ eventId, title }: { eventId: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recent = useRef(new Map<string, number>());
  const busy = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [result, setResult] = useState<Result | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const show = useCallback((r: Result) => {
    setResult(r);
    navigator.vibrate?.(r.result === 'ok' ? 80 : [200, 100, 200]);
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setResult(null), r.result === 'ok' ? 1500 : 3500);
  }, []);

  const onCode = useCallback(
    async (text: string) => {
      const token = tokenFromScan(text);
      const key = token ?? text;
      const last = recent.current.get(key);
      if (last && Date.now() - last < 2500) return; // same QR still in front of the camera
      recent.current.set(key, Date.now());
      if (!token) return show({ result: 'not_found' });
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, eventId }),
        });
        show(await res.json());
      } catch {
        show({ result: 'error' });
      } finally {
        busy.current = false;
      }
    },
    [eventId, show],
  );

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: { stop(): Promise<void> } | null = null;

    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Ctor) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          const video = videoRef.current!;
          video.srcObject = stream;
          await video.play();
          const detector = new Ctor({ formats: ['qr_code'] });
          const loop = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]) await onCode(codes[0].rawValue);
            } catch {
              // frame not ready yet
            }
            timer = setTimeout(loop, 120);
          };
          loop();
        } else {
          const { Html5Qrcode } = await import('html5-qrcode'); // iOS Safari and older Android
          const h = new Html5Qrcode('qr-fallback');
          await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (text) => void onCode(text), () => {});
          if (stopped) await h.stop();
          else fallback = h;
        }
      } catch {
        setCameraError('Camera unavailable. Allow camera access in your browser settings, or type the ticket code below.');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      fallback?.stop().catch(() => {});
    };
  }, [onCode]);

  const r = result && describe(result);
  return (
    <main className="mx-auto max-w-md px-4 py-4">
      <Link href="/scan" className="text-sm underline">← Events</Link>
      <h1 className="mb-3 mt-1 font-semibold">{title}</h1>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div id="qr-fallback" className="absolute inset-0" />
        {r && (
          <button
            type="button"
            onClick={() => setResult(null)}
            className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white ${r.ok ? 'bg-green-600' : 'bg-red-600'}`}
            aria-live="assertive"
          >
            <span className="text-3xl font-bold">{r.title}</span>
            {r.detail && <span className="mt-2 text-lg">{r.detail}</span>}
          </button>
        )}
      </div>
      {cameraError && <p className="mt-3 text-sm text-destructive">{cameraError}</p>}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          recent.current.delete(manual.trim());
          void onCode(manual);
          setManual('');
        }}
      >
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type ticket code" aria-label="Ticket code" />
        <Button type="submit" variant="secondary">Check</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Verify by hand**

Run: `pnpm typecheck && pnpm dev`. Sign in as `gate@ticketdino.test`, open `/scan`, and pick Dino Fest 2026.
1. Paste a paid ticket's code into "Type ticket code" → green "Valid ✓ · name · type".
2. Check it again → red "Already scanned 7:41:02 pm by gate@ticketdino.test".
3. Try a refunded ticket → red "Void ticket". Try `garbage` → "Not a valid ticket".
4. On a phone you need HTTPS: run `pnpm dlx cloudflared tunnel --url http://localhost:3000`, open the tunnel URL, and scan a ticket's QR from another screen. The result should appear in under 1 s.

- [ ] **Step 5: Commit**

```bash
git add src/app/scan src/app/api/scan
git commit -m "feat: camera gate scanner with atomic check-in"
```
