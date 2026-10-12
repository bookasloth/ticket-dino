import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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
        <Link href="/admin/events/new" className={buttonVariants()}>New event</Link>
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
