import 'server-only';
import { after } from 'next/server';
import { CouponExhaustedError, UnavailableError, type CheckoutDeps } from './checkout';
import { sendPendingNotifications } from './email/send';
import { report } from './report';
import { adminDb } from './supabase/admin';
import { createPaymentSession } from './zoho';

type TicketTypeRow = {
  id: string; name: string; price_paise: number; gst_rate: number; max_per_order: number;
  group_min_qty: number | null; group_pct: number | null;
};
type AddonRow = { id: string; name: string; price_paise: number; gst_rate: number; max_per_order: number };

export function checkoutDeps(): CheckoutDeps {
  const db = adminDb();
  return {
    async loadEvent(id) {
      const { data } = await db
        .from('events')
        .select('id, fee_bps, fee_flat_paise, fee_gst_rate, ticket_types(id, name, price_paise, gst_rate, max_per_order, group_min_qty, group_pct), addons(id, name, price_paise, gst_rate, max_per_order)')
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
          groupMinQty: t.group_min_qty, groupPct: t.group_pct === null ? null : Number(t.group_pct),
        })),
        addons: (data.addons as AddonRow[]).map((a) => ({
          id: a.id, name: a.name, pricePaise: a.price_paise, gstRate: Number(a.gst_rate), maxPerOrder: a.max_per_order,
        })),
      };
    },
    async loadCoupon(eventId, code) {
      const { data: c } = await db
        .from('coupons')
        .select('id, kind, value, max_discount_paise, ticket_type_ids, max_uses, used_count, held_count, valid_until, active')
        .eq('event_id', eventId)
        .eq('code', code)
        .maybeSingle();
      if (!c) return null;
      return {
        id: c.id, kind: c.kind, value: c.value, maxDiscountPaise: c.max_discount_paise, ticketTypeIds: c.ticket_type_ids,
        active: c.active, validUntil: c.valid_until,
        exhausted: c.max_uses !== null && c.used_count + c.held_count >= c.max_uses,
      };
    },
    async createOrder(order, items, addons = []) {
      const { data, error } = await db.rpc('create_order', { p_order: order, p_items: items, p_addons: addons });
      if (error) {
        if (error.message.includes('COUPON_EXHAUSTED')) throw new CouponExhaustedError();
        const m = error.message.match(/UNAVAILABLE:([0-9a-f-]{36})/);
        if (m) throw new UnavailableError(m[1]);
        throw new Error(`create_order: ${error.message}`);
      }
      const row = (data as { id: string; access_key: string }[])[0];
      return { id: row.id, accessKey: row.access_key };
    },
    async createPaymentSession(orderId, amountPaise) {
      try {
        return await createPaymentSession(orderId, amountPaise, `TicketDino tickets, order ${orderId.slice(0, 8)}`);
      } catch (e) {
        report(e, { orderId, step: 'zoho.paymentsessions.create' });
        throw e;
      }
    },
    async attachPaymentSession(orderId, sessionId) {
      // ponytail: Zoho session id lives in the razorpay_order_id column (unique text); rename when Razorpay is dropped for good.
      const { error } = await db.from('orders').update({ razorpay_order_id: sessionId }).eq('id', orderId);
      if (error) throw new Error(`attach payment session: ${error.message}`);
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
