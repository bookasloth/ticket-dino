import { report } from '@/lib/report';
import { settleZohoPayment, verifyWebhookSignature } from '@/lib/zoho';

// Catches payments where the buyer closed the tab before /verify ran. A 500 makes Zoho retry.
export async function POST(req: Request) {
  const raw = await req.text(); // the signature covers the exact bytes
  const key = process.env.ZOHO_PAY_WEBHOOK_SIGNING_KEY;
  if (!key || !verifyWebhookSignature(raw, req.headers.get('x-zoho-webhook-signature'), key)) {
    return new Response('invalid signature', { status: 401 });
  }
  let event: { event_type?: string; event_object?: { payment?: { payment_id?: string | number } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  const paymentId = event.event_object?.payment?.payment_id;
  if (event.event_type === 'payment.succeeded' && paymentId) {
    try {
      await settleZohoPayment(String(paymentId));
    } catch (e) {
      report(e, { paymentId, step: 'zoho.webhook' });
      return new Response('processing failed', { status: 500 });
    }
  }
  return new Response('ok');
}
