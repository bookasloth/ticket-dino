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
