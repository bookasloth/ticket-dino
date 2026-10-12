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
