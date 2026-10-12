// Zoho Payments (India) server client. Ported from indian-squad / Coffee and Toffee.
import 'server-only';
import { sendPendingNotifications } from './email/send';
import { settlePayment, type RefundApi } from './payments';
import { report } from './report';
import { adminDb } from './supabase/admin';

export { verifyWebhookSignature } from './zoho-signature';

const SANDBOX = process.env.NEXT_PUBLIC_ZOHO_PAY_SANDBOX === 'true';
const API = SANDBOX ? 'https://paymentssandbox.zoho.in/api/v1' : 'https://payments.zoho.in/api/v1';

export type ZohoPayment = {
  payment_id: string;
  status: string; // initiated | succeeded | failed | canceled | incomplete | refunded | ...
  amount: string; // "200.00"
  currency: string;
  payments_session_id: string;
  reference_number?: string;
};

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

// ponytail: per-instance cache; Zoho rate-limits refreshes per token. Move to a shared cache if many instances.
let token: { value: string; expires: number } | undefined;

async function accessToken() {
  if (token && Date.now() < token.expires) return token.value;
  const params = new URLSearchParams({
    refresh_token: env('ZOHO_PAY_REFRESH_TOKEN'),
    client_id: env('ZOHO_PAY_CLIENT_ID'),
    client_secret: env('ZOHO_PAY_CLIENT_SECRET'),
    grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.in/oauth/v2/token?${params}`, { method: 'POST', cache: 'no-store' });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Zoho token refresh failed: ${data.error ?? res.status}`);
  // Zoho India returns expires_in in MILLISECONDS and the seconds in expires_in_sec.
  token = { value: data.access_token, expires: Date.now() + ((data.expires_in_sec ?? 3600) - 60) * 1000 };
  return token.value;
}

async function zoho(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}?account_id=${env('NEXT_PUBLIC_ZOHO_PAY_ACCOUNT_ID')}`, {
    ...init,
    headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Zoho ${path} failed: ${data.message ?? res.status}`);
  return data;
}

const rupees = (paise: number) => Number((paise / 100).toFixed(2));
const toPaise = (amount: string) => Math.round(Number(amount) * 100);

export async function createPaymentSession(orderId: string, amountPaise: number, description: string): Promise<string> {
  const data = await zoho('/paymentsessions', {
    method: 'POST',
    body: JSON.stringify({
      amount: rupees(amountPaise),
      currency: 'INR',
      description: description.slice(0, 500),
      reference_number: orderId,
    }),
  });
  return data.payments_session.payments_session_id as string;
}

export async function getPayment(paymentId: string): Promise<ZohoPayment> {
  return (await zoho(`/payments/${encodeURIComponent(paymentId)}`)).payment;
}

/** The succeeded payment on a session, if any. Used by the reconcile job when the webhook never arrived. */
export async function succeededPaymentForSession(sessionId: string): Promise<ZohoPayment | null> {
  const s = (await zoho(`/paymentsessions/${encodeURIComponent(sessionId)}`)).payments_session;
  const p = (s?.payments ?? []).find((x: { status?: string }) => x.status === 'succeeded');
  return p ? getPayment(String(p.payment_id)) : null;
}

export function zohoRefunds(): RefundApi {
  return {
    async listRefunds(paymentId) {
      const p = await getPayment(paymentId);
      // ponytail: Zoho has no list-by-payment here; a refunded status means we already refunded it once.
      return p.status.includes('refund') ? [{ id: `zoho-refund:${paymentId}` }] : [];
    },
    async refund(paymentId, amountPaise, orderId) {
      const d = await zoho(`/payments/${encodeURIComponent(paymentId)}/refunds`, {
        method: 'POST',
        body: JSON.stringify({ amount: rupees(amountPaise), reason: 'requested_by_customer', description: `Late payment, sold out: ${orderId}` }),
      });
      return { id: String(d.refund?.refund_id ?? `zoho-refund:${paymentId}`) };
    },
  };
}

/**
 * Single path to "paid" for Zoho: verify route, webhook and reconcile all land here.
 * Never trusts the browser or webhook body: re-fetches the payment and checks it against our order.
 */
export async function settleZohoPayment(paymentId: string): Promise<{ paid: boolean; status: string; orderId?: string }> {
  const p = await getPayment(paymentId);
  if (p.status !== 'succeeded') return { paid: false, status: p.status };

  const db = adminDb();
  const ref = p.reference_number ?? '';
  const { data: order } = /^[0-9a-f-]{36}$/.test(ref)
    ? await db.from('orders').select('id, total_paise').eq('id', ref).maybeSingle()
    : { data: null };
  // The Zoho account is shared with other Timewheel products, so its webhook also delivers their payments.
  if (!order) return { paid: false, status: 'not_ours' };
  if (p.currency !== 'INR' || toPaise(p.amount) !== order.total_paise) {
    throw new Error(`Zoho payment ${paymentId}: paid ${p.currency} ${p.amount}, order ${order.id} expects ${order.total_paise} paise`);
  }

  const result = await settlePayment(db, zohoRefunds(), order.id, paymentId, order.total_paise);
  await sendPendingNotifications(order.id).catch((e) => report(e, { orderId: order.id }));
  return { paid: result !== 'late_refunded', status: result, orderId: order.id };
}
