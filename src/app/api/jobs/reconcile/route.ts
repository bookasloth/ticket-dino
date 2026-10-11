import { isCron } from '@/lib/cron';
import { sendPendingNotifications } from '@/lib/email/send';
import { settlePayment } from '@/lib/payments';
import { capturedPayment, refundApi } from '@/lib/razorpay';
import { report } from '@/lib/report';
import { adminDb } from '@/lib/supabase/admin';

export const maxDuration = 60;

/**
 * Brief rule 3: settle orders whose webhook never arrived. Unpaid orders are marked expired by
 * expire_holds after 10 minutes, so we look at expired/failed/pending orders 15 min – 3 h old.
 * ponytail: re-checks the whole window every run (≤100 Razorpay calls); add a reconciled_at cursor if volume grows.
 */
export async function POST(req: Request) {
  if (!isCron(req)) return new Response('unauthorized', { status: 401 });
  const db = adminDb();
  const now = Date.now();
  const { data: orders, error } = await db
    .from('orders')
    .select('id, razorpay_order_id')
    .in('status', ['pending', 'expired', 'failed'])
    .not('razorpay_order_id', 'is', null)
    .lt('created_at', new Date(now - 15 * 60_000).toISOString())
    .gt('created_at', new Date(now - 3 * 3_600_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    report(error, { job: 'reconcile' });
    return new Response('query failed', { status: 500 });
  }

  let settled = 0;
  for (const o of orders ?? []) {
    try {
      const payment = await capturedPayment(o.razorpay_order_id);
      if (!payment) continue;
      await settlePayment(db, refundApi(), o.id, payment.id, payment.amount);
      settled++;
      await sendPendingNotifications(o.id);
    } catch (e) {
      report(e, { job: 'reconcile', orderId: o.id });
    }
  }
  return Response.json({ checked: orders?.length ?? 0, settled });
}
