import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireMember } from '@/lib/auth';
import { formatINR } from '@/lib/money';
import { formatIST } from '@/lib/time';

const STATUSES = ['paid', 'pending', 'failed', 'expired', 'refunded'];

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string }> };

export default async function OrdersPage({ params, searchParams }: Props) {
  const [{ id }, { q = '', status = '' }] = await Promise.all([params, searchParams]);
  if (!z.guid().safeParse(id).success) notFound();
  const { db, organizerId } = await requireMember();
  const { data: event } = await db.from('events').select('id, title').eq('id', id).eq('organizer_id', organizerId).maybeSingle();
  if (!event) notFound();

  let query = db
    .from('orders')
    .select('id, number, buyer_name, buyer_email, buyer_phone, total_paise, status, created_at')
    .eq('event_id', id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (STATUSES.includes(status)) query = query.eq('status', status);

  const term = q.trim();
  const orderNo = term.match(/^td-?(\d+)$/i);
  if (orderNo) query = query.eq('number', Number(orderNo[1]));
  else if (z.guid().safeParse(term).success) query = query.eq('id', term);
  else if (term) {
    // Strip characters that have meaning in PostgREST filter syntax before building the OR filter.
    const safe = term.replace(/[^\w@.+\- ]/g, '');
    if (safe) {
      query = query.or(
        [`buyer_name.ilike."%${safe}%"`, `buyer_email.ilike."%${safe}%"`, `buyer_phone.ilike."%${safe}%"`,
         `razorpay_order_id.eq."${safe}"`, `razorpay_payment_id.eq."${safe}"`].join(','),
      );
    }
  }
  const [{ data: orders }, { data: paid }] = await Promise.all([
    query,
    db.from('orders').select('total_paise').eq('event_id', id).eq('status', 'paid'),
  ]);
  const revenue = (paid ?? []).reduce((n, o) => n + o.total_paise, 0);

  return (
    <main className="space-y-4">
      <Link href={`/admin/events/${id}`} className="text-sm underline">← {event.title}</Link>
      <h1 className="text-2xl font-bold">Orders</h1>
      <p className="text-sm text-muted-foreground">{paid?.length ?? 0} paid orders · {formatINR(revenue)} collected (incl. fees and GST)</p>
      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Name, phone, email, TD-123 or Razorpay id" className="max-w-sm" />
        <select name="status" defaultValue={status} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Order</TableHead><TableHead>Buyer</TableHead><TableHead>Phone</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Placed</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {(orders ?? []).map((o) => (
            <TableRow key={o.id}>
              <TableCell><Link className="underline" href={`/admin/orders/${o.id}`}>TD-{o.number}</Link></TableCell>
              <TableCell>{o.buyer_name}<div className="text-xs text-muted-foreground">{o.buyer_email}</div></TableCell>
              <TableCell>{o.buyer_phone}</TableCell>
              <TableCell>{formatINR(o.total_paise)}</TableCell>
              <TableCell><Badge variant={o.status === 'paid' ? 'default' : 'secondary'}>{o.status}</Badge></TableCell>
              <TableCell>{formatIST(o.created_at)}</TableCell>
            </TableRow>
          ))}
          {!orders?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No orders found.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </main>
  );
}
