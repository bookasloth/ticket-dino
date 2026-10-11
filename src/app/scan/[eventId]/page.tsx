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
