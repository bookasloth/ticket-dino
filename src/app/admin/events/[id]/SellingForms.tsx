'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveAddon, saveCoupon, toggleCoupon } from '../actions';

const Msg = ({ s }: { s: { error?: string; ok?: string } | null }) =>
  s?.error ? <p className="text-sm text-destructive sm:col-span-4">{s.error}</p> : s?.ok ? <p className="text-sm text-green-700 sm:col-span-4">{s.ok}</p> : null;

function F({ id, label, ...p }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={p.name ?? id.split('-').pop()} {...p} />
    </div>
  );
}

export type CouponRow = {
  id: string; code: string; kind: 'percent' | 'flat'; value: number; max_uses: number | null; used_count: number;
  held_count: number; valid_until: string | null; active: boolean;
};

export function CouponList({ eventId, coupons }: { eventId: string; coupons: CouponRow[] }) {
  const [state, action, pending] = useActionState(toggleCoupon, null);
  if (!coupons.length) return <p className="text-sm text-muted-foreground">No coupons yet.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {coupons.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
          <code className="rounded bg-muted px-2 py-0.5 font-semibold">{c.code}</code>
          <span>{c.kind === 'percent' ? `${c.value}% off` : `₹${c.value / 100} off`}</span>
          <span className="text-muted-foreground">
            {c.used_count} used{c.max_uses ? ` of ${c.max_uses}` : ''}{c.held_count ? ` · ${c.held_count} in checkout` : ''}
          </span>
          <form action={action} className="ml-auto">
            <input type="hidden" name="event_id" value={eventId} />
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="active" value={String(!c.active)} />
            <Button size="sm" variant={c.active ? 'outline' : 'default'} disabled={pending}>{c.active ? 'Pause' : 'Resume'}</Button>
          </form>
        </li>
      ))}
      <Msg s={state} />
    </ul>
  );
}

export function CouponForm({ eventId, ticketTypes }: { eventId: string; ticketTypes: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveCoupon, null);
  return (
    <form action={action} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="event_id" value={eventId} />
      <F id="cp-code" label="Code" required placeholder="DIWALI20" />
      <div className="space-y-1">
        <Label htmlFor="cp-kind">Type</Label>
        <select id="cp-kind" name="kind" className="h-9 w-full rounded-md border bg-background px-2">
          <option value="percent">% off</option>
          <option value="flat">₹ off</option>
        </select>
      </div>
      <F id="cp-value" label="Value (% or ₹)" required inputMode="decimal" />
      <F id="cp-max_discount" label="Max discount ₹ (optional)" inputMode="decimal" />
      <F id="cp-max_uses" label="Max uses (optional)" type="number" min={1} />
      <F id="cp-valid_until" label="Valid until (IST, optional)" type="datetime-local" />
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="cp-tt">Only for ticket type</Label>
        <select id="cp-tt" name="ticket_type_id" className="h-9 w-full rounded-md border bg-background px-2">
          <option value="">Any ticket (and extras)</option>
          {ticketTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-4"><Button disabled={pending}>{pending ? 'Saving…' : 'Create coupon'}</Button></div>
      <Msg s={state} />
    </form>
  );
}

export type AddonValues = { id?: string; name: string; price: string; gst_rate: string; capacity: string; max_per_order: string; sold?: number };

export function AddonForm({ eventId, values: v }: { eventId: string; values: AddonValues }) {
  const [state, action, pending] = useActionState(saveAddon, null);
  const k = v.id ?? 'new';
  return (
    <form action={action} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
      <input type="hidden" name="event_id" value={eventId} />
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="sm:col-span-2"><F id={`${k}-name`} label="Name" required defaultValue={v.name} placeholder="Car parking pass" /></div>
      <F id={`${k}-price`} label="Price ₹ (excl. GST)" required inputMode="decimal" defaultValue={v.price} />
      <F id={`${k}-gst_rate`} label="GST %" type="number" step="0.01" min={0} max={40} required defaultValue={v.gst_rate} />
      <F id={`${k}-capacity`} label="Stock" type="number" min={0} required defaultValue={v.capacity} />
      <F id={`${k}-max_per_order`} label="Max per order" type="number" min={1} max={50} required defaultValue={v.max_per_order} />
      <div className="flex items-end gap-2 sm:col-span-2">
        <Button disabled={pending}>{pending ? 'Saving…' : v.id ? 'Save' : 'Add extra'}</Button>
        {v.id && <span className="text-sm text-muted-foreground">{v.sold} sold</span>}
      </div>
      <Msg s={state} />
    </form>
  );
}
