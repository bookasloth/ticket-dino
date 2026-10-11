import 'server-only';
import { after } from 'next/server';
import { UnavailableError, type CheckoutDeps } from './checkout';
import { sendPendingNotifications } from './email/send';
import { razorpay } from './razorpay';
import { report } from './report';
import { adminDb } from './supabase/admin';

type TicketTypeRow = { id: string; name: string; price_paise: number; gst_rate: number; max_per_order: number };

export function checkoutDeps(): CheckoutDeps {
  const db = adminDb();
  return {
    async loadEvent(id) {
      const { data } = await db
        .from('events')
        .select('id, fee_bps, fee_flat_paise, fee_gst_rate, ticket_types(id, name, price_paise, gst_rate, max_per_order)')
        .eq('id', id)
        .eq('status', 'published')
        .maybeSingle();
      if (!data) return null;
      return {
        id: data.id,
        feeBps: data.fee_bps,
        feeFlatPaise: data.fee_flat_paise,
        feeGstRate: Number(data.fee_gst_rate),
        ticketTypes: (data.ticket_types as TicketTypeRow[]).map((t) => ({
          id: t.id, name: t.name, pricePaise: t.price_paise, gstRate: Number(t.gst_rate), maxPerOrder: t.max_per_order,
        })),
      };
    },
    async createOrder(order, items) {
      const { data, error } = await db.rpc('create_order', { p_order: order, p_items: items });
      if (error) {
        const m = error.message.match(/UNAVAILABLE:([0-9a-f-]{36})/);
        if (m) throw new UnavailableError(m[1]);
        throw new Error(`create_order: ${error.message}`);
      }
      const row = (data as { id: string; access_key: string }[])[0];
      return { id: row.id, accessKey: row.access_key };
    },
    async createRazorpayOrder(orderId, amountPaise) {
      try {
        const o = await razorpay().orders.create({
          amount: amountPaise,
          currency: 'INR',
          receipt: orderId,
          notes: { app: 'ticketdino', order_id: orderId },
        });
        return o.id;
      } catch (e) {
        report(e, { orderId, step: 'razorpay.orders.create' });
        throw e;
      }
    },
    async attachRazorpayOrder(orderId, rzpOrderId) {
      const { error } = await db.from('orders').update({ razorpay_order_id: rzpOrderId }).eq('id', orderId);
      if (error) throw new Error(`attach razorpay order: ${error.message}`);
    },
    async failOrder(orderId) {
      const { error } = await db.rpc('fail_order', { p_order_id: orderId });
      if (error) report(error, { orderId, step: 'fail_order' });
    },
    async finalizeFree(orderId) {
      const { error } = await db.rpc('finalize_paid_order', { p_order_id: orderId, p_payment_id: 'free' });
      if (error) throw new Error(`finalize free order: ${error.message}`);
      after(() => sendPendingNotifications(orderId).catch((e) => report(e, { orderId })));
    },
  };
}
