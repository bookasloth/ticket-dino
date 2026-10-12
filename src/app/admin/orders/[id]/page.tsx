import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { requireMember } from '@/lib/auth';
import { formatINR } from '@/lib/money';
import { formatIST } from '@/lib/time';
import { RefundForm } from './RefundForm';

type Order = {
  id: string; number: number; organizer_id: string; status: string; buyer_name: string; buyer_email: string; buyer_phone: string;
  subtotal_paise: number; fee_paise: number; gst_paise: number; total_paise: number; razorpay_order_id: string | null;
  razorpay_payment_id: string | null; created_at: string; paid_at: string | null;
  event: { id: string; title: string };
  order_items: { qty: number; unit_price_paise: number; ticket_type: { name: string } }[];
  tickets: { id: string; qr_token: string; status: string; checked_in_at: string | null; ticket_type: { name: string } }[];
  refunds: { amount_paise: number; reason: string | null; status: string; created_at: string; razorpay_refund_id: string | null }[];
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const { db, organizerId } = await requireMember();
  const { data } = await db
    .from('orders')
    .select(`*, event:events(id, title), order_items(qty, unit_price_paise, ticket_type:ticket_types(name)),
             tickets(id, qr_token, status, checked_in_at, ticket_type:ticket_types(name)),
             refunds(amount_paise, reason, status, created_at, razorpay_refund_id)`)
    .eq('id', id)
    .maybeSingle();
  const o = data as Order | null;
  if (!o || o.organizer_id !== organizerId) notFound();

  return (
    <main className="space-y-6">
      <Link href={`/admin/events/${o.event.id}/orders`} className="text-sm underline">← Orders for {o.event.title}</Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">TD-{o.number}</h1>
        <Badge>{o.status}</Badge>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Buyer</dt><dd>{o.buyer_name}</dd>
        <dt className="text-muted-foreground">Email</dt><dd>{o.buyer_email}</dd>
        <dt className="text-muted-foreground">Phone</dt><dd>{o.buyer_phone}</dd>
        <dt className="text-muted-foreground">Placed</dt><dd>{formatIST(o.created_at)}</dd>
        {o.paid_at && <><dt className="text-muted-foreground">Paid</dt><dd>{formatIST(o.paid_at)}</dd></>}
        <dt className="text-muted-foreground">Razorpay</dt><dd>{o.razorpay_order_id ?? '—'} / {o.razorpay_payment_id ?? '—'}</dd>
      </dl>

      <section>
        <h2 className="mb-2 font-semibold">Items</h2>
        <ul className="text-sm">
          {o.order_items.map((i, n) => <li key={n}>{i.qty} × {i.ticket_type.name} @ {formatINR(i.unit_price_paise)}</li>)}
        </ul>
        <p className="mt-2 text-sm">
          Subtotal {formatINR(o.subtotal_paise)} · Fee {formatINR(o.fee_paise)} · GST {formatINR(o.gst_paise)} ·{' '}
          <strong>Total {formatINR(o.total_paise)}</strong>
        </p>
      </section>

      {o.tickets.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Tickets</h2>
          <ul className="space-y-1 text-sm">
            {o.tickets.map((t) => (
              <li key={t.id}>
                <a className="underline" href={`/t/${t.qr_token}`} target="_blank">{t.ticket_type.name}</a> · {t.status}
                {t.checked_in_at && ` at ${formatIST(t.checked_in_at)}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {o.refunds.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Refunds</h2>
          <ul className="text-sm">
            {o.refunds.map((r, n) => (
              <li key={n}>{formatINR(r.amount_paise)} · {r.status} · {formatIST(r.created_at)}{r.reason ? ` · ${r.reason}` : ''}</li>
            ))}
          </ul>
        </section>
      )}

      {o.status === 'paid' && <RefundForm orderId={o.id} amount={formatINR(o.total_paise)} />}
    </main>
  );
}
