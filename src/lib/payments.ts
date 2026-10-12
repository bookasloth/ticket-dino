export type RpcDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type RefundApi = {
  listRefunds(paymentId: string): Promise<{ id: string }[]>;
  refund(paymentId: string, amountPaise: number, orderId: string): Promise<{ id: string }>;
};

/**
 * Marks an order paid (idempotent). If the payment arrived after the seats were resold, refunds it
 * exactly once — an existing Razorpay refund on the payment is reused (brief rules 4 + 5).
 */
export async function settlePayment(
  db: RpcDb,
  refunds: RefundApi,
  orderId: string,
  paymentId: string,
  amountPaise: number,
): Promise<'issued' | 'already_done' | 'late_refunded'> {
  const { data, error } = await db.rpc('finalize_paid_order', { p_order_id: orderId, p_payment_id: paymentId });
  if (error) throw new Error(`finalize_paid_order: ${error.message}`);
  if (data !== 'late_no_inventory') return data as 'issued' | 'already_done';

  const existing = await refunds.listRefunds(paymentId);
  const refund = existing[0] ?? (await refunds.refund(paymentId, amountPaise, orderId));
  const recorded = await db.rpc('record_late_refund', {
    p_order_id: orderId,
    p_amount_paise: amountPaise,
    p_refund_id: refund.id,
  });
  if (recorded.error) throw new Error(`record_late_refund: ${recorded.error.message}`);
  return 'late_refunded';
}
