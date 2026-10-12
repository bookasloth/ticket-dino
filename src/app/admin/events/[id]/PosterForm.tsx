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
