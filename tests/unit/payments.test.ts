import { describe, expect, it, vi } from 'vitest';
import { settlePayment, type RefundApi, type RpcDb } from '@/lib/payments';

function fakeDb(finalizeResult: string) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db: RpcDb = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return fn === 'finalize_paid_order' ? { data: finalizeResult, error: null } : { data: null, error: null };
    },
  };
  return { db, calls };
}
function fakeRefunds(existing: { id: string }[] = []): RefundApi & { refund: ReturnType<typeof vi.fn> } {
  return { listRefunds: vi.fn(async () => existing), refund: vi.fn(async () => ({ id: 'rfnd_new' })) };
}

describe('settlePayment', () => {
  it('issues tickets without touching refunds', async () => {
    const { db } = fakeDb('issued');
    const refunds = fakeRefunds();
    expect(await settlePayment(db, refunds, 'o1', 'pay_1', 1000)).toBe('issued');
    expect(refunds.refund).not.toHaveBeenCalled();
  });

  it('refunds a late payment once and records it', async () => {
    const { db, calls } = fakeDb('late_no_inventory');
    const refunds = fakeRefunds();
    expect(await settlePayment(db, refunds, 'o1', 'pay_1', 1000)).toBe('late_refunded');
    expect(refunds.refund).toHaveBeenCalledWith('pay_1', 1000, 'o1');
    expect(calls.at(-1)).toEqual({ fn: 'record_late_refund', args: { p_order_id: 'o1', p_amount_paise: 1000, p_refund_id: 'rfnd_new' } });
  });

  it('does not refund twice when a refund already exists (webhook retry / reconcile)', async () => {
    const { db, calls } = fakeDb('late_no_inventory');
    const refunds = fakeRefunds([{ id: 'rfnd_old' }]);
    await settlePayment(db, refunds, 'o1', 'pay_1', 1000);
    expect(refunds.refund).not.toHaveBeenCalled();
    expect(calls.at(-1)?.args.p_refund_id).toBe('rfnd_old');
  });

  it('throws on database errors so the webhook returns 500 and Razorpay retries', async () => {
    const db: RpcDb = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    await expect(settlePayment(db, fakeRefunds(), 'o1', 'pay_1', 1000)).rejects.toThrow('boom');
  });
});
