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
