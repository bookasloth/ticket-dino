// Usage: node --env-file=.env.local scripts/send-webhook.mjs <razorpay_order_id> <amount_paise> [event_id]
import { createHmac } from 'node:crypto';

const [rzpOrderId, amount, eventId = `evt_local_${Date.now()}`] = process.argv.slice(2);
if (!rzpOrderId || !amount) {
  console.error('usage: send-webhook.mjs <razorpay_order_id> <amount_paise> [event_id]');
  process.exit(1);
}
const body = JSON.stringify({
  event: 'order.paid',
  payload: {
    order: { entity: { id: rzpOrderId, amount: Number(amount) } },
    payment: { entity: { id: `pay_local_${Date.now()}`, order_id: rzpOrderId, amount: Number(amount), status: 'captured' } },
  },
});
const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/razorpay`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
  body,
});
console.log(res.status, await res.text());
