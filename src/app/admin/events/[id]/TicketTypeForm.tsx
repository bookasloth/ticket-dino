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
