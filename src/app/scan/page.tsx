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
