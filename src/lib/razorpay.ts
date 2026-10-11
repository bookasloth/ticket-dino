import 'server-only';
import Razorpay from 'razorpay';
import type { RefundApi } from './payments';

let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  client ??= new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
  return client;
}

export function refundApi(): RefundApi {
  return {
    async listRefunds(paymentId) {
      const res = await razorpay().payments.fetchMultipleRefund(paymentId);
      return res.items.map((r) => ({ id: r.id }));
    },
    async refund(paymentId, amountPaise, orderId) {
      const r = await razorpay().payments.refund(paymentId, {
        amount: amountPaise,
        notes: { order_id: orderId, reason: 'late_payment_sold_out' },
      });
      return { id: r.id };
    },
  };
}

export async function capturedPayment(rzpOrderId: string): Promise<{ id: string; amount: number } | null> {
  const res = await razorpay().orders.fetchPayments(rzpOrderId);
  const p = res.items.find((i) => i.status === 'captured');
  return p ? { id: p.id, amount: Number(p.amount) } : null;
}
