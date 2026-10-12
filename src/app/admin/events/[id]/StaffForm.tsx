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
