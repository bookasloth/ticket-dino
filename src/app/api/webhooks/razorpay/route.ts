import { after } from 'next/server';
import { sendPendingNotifications } from '@/lib/email/send';
import { settlePayment } from '@/lib/payments';
import { refundApi } from '@/lib/razorpay';
import { report } from '@/lib/report';
import { adminDb } from '@/lib/supabase/admin';
import { parseRazorpayEvent, verifyRazorpaySignature } from '@/lib/webhook';

// Brief rule 2: the webhook is the only source of truth for "paid".
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyRazorpaySignature(raw, req.headers.get('x-razorpay-signature'), process.env.RAZORPAY_WEBHOOK_SECRET!)) {
    return new Response('invalid signature', { status: 400 });
  }
  let body: { event?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const action = parseRazorpayEvent(body);
  const eventId =
    req.headers.get('x-razorpay-event-id') ??
    `${body.event}:${action.kind === 'ignore' ? 'na' : action.rzpOrderId}:${action.kind === 'paid' ? action.paymentId : ''}`;
  const db = adminDb();

  try {
    const logged = await db
      .from('webhook_events')
      .upsert(
        { provider: 'razorpay', event_id: eventId, type: body.event ?? null, payload: body },
        { onConflict: 'provider,event_id', ignoreDuplicates: true },
      );
    if (logged.error) throw logged.error;
    const { data: row, error } = await db
      .from('webhook_events')
      .select('id, processed_at')
      .eq('provider', 'razorpay')
      .eq('event_id', eventId)
      .single();
    if (error) throw error;
    if (row.processed_at) return Response.json({ ok: true, duplicate: true });

    if (action.kind !== 'ignore') {
      const { data: order, error: orderError } = await db
        .from('orders')
        .select('id, total_paise')
        .eq('razorpay_order_id', action.rzpOrderId)
        .maybeSingle();
      if (orderError) throw orderError;

      // No match = an order from another Timewheel product on the same Razorpay account. Ignore it.
      if (order && action.kind === 'paid') {
        if (action.amountPaise !== order.total_paise) {
          throw new Error(`amount mismatch on order ${order.id}: paid ${action.amountPaise}, expected ${order.total_paise}`);
        }
        await settlePayment(db, refundApi(), order.id, action.paymentId, action.amountPaise);
        after(() => sendPendingNotifications(order.id).catch((e) => report(e, { orderId: order.id })));
      } else if (order && action.kind === 'failed') {
        const { error: failError } = await db.rpc('fail_order', { p_order_id: order.id });
        if (failError) throw failError;
      }
    }

    await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', row.id);
    return Response.json({ ok: true });
  } catch (e) {
    report(e, { eventId, event: body.event });
    return new Response('processing failed', { status: 500 });
  }
}
