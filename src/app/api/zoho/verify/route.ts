import { report } from '@/lib/report';
import { settleZohoPayment } from '@/lib/zoho';

// Called by the browser right after the Zoho widget succeeds. Safe to trust only because
// settleZohoPayment re-fetches the payment from Zoho and checks it against our order.
export async function POST(req: Request) {
  const { paymentId } = await req.json().catch(() => ({}));
  if (typeof paymentId !== 'string' || !/^\d{1,30}$/.test(paymentId)) {
    return Response.json({ error: 'Invalid payment.' }, { status: 400 });
  }
  try {
    return Response.json(await settleZohoPayment(paymentId));
  } catch (e) {
    report(e, { paymentId, step: 'zoho.verify' });
    return Response.json({ paid: false, status: 'processing' });
  }
}
