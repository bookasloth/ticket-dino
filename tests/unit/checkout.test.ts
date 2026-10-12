import { describe, expect, it, vi } from 'vitest';
import { placeOrder, UnavailableError, type CheckoutDeps, type CheckoutInput } from '@/lib/checkout';

const EV = '00000000-0000-4000-8000-000000000001';
const GA = '00000000-0000-4000-8000-0000000000a1';
const KIDS = '00000000-0000-4000-8000-0000000000a2';

function deps(over: Partial<CheckoutDeps> = {}) {
  const d = {
    loadEvent: vi.fn(async () => ({
      id: EV, feeBps: 200, feeFlatPaise: 1000, feeGstRate: 18,
      ticketTypes: [
        { id: GA, name: 'General', pricePaise: 50_000, gstRate: 18, maxPerOrder: 4 },
        { id: KIDS, name: 'Kids', pricePaise: 0, gstRate: 0, maxPerOrder: 2 },
      ],
    })),
    createOrder: vi.fn(async () => ({ id: 'order-1', accessKey: 'key-1' })),
    createPaymentSession: vi.fn(async () => 'order_rzp_1'),
    attachPaymentSession: vi.fn(async () => {}),
    failOrder: vi.fn(async () => {}),
    finalizeFree: vi.fn(async () => {}),
    ...over,
  };
  return d as typeof d & CheckoutDeps;
}

const input = (items: CheckoutInput['items'], phone = '98765 43210'): CheckoutInput => ({
  eventId: EV, items, consent: true, buyer: { name: 'Asha', email: 'Asha@Example.com', phone },
});

describe('placeOrder', () => {
  it('prices on the server and opens a Razorpay order for the exact total', async () => {
    const d = deps();
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 2 }]));
    expect(r).toEqual({ ok: true, free: false, orderId: 'order-1', accessKey: 'key-1', paymentSessionId: 'order_rzp_1', amountPaise: 122_720 });
    expect(d.createPaymentSession).toHaveBeenCalledWith('order-1', 122_720);
    const [order, items] = vi.mocked(d.createOrder).mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>[]];
    expect(order).toMatchObject({ buyer_phone: '+919876543210', buyer_email: 'asha@example.com', total_paise: 122_720 });
    expect(items).toEqual([{ ticket_type_id: GA, qty: 2, unit_price_paise: 50_000, gst_rate: 18, discount_paise: 0 }]);
  });

  it('issues free tickets without Razorpay', async () => {
    const d = deps();
    const r = await placeOrder(d, input([{ ticketTypeId: KIDS, qty: 2 }]));
    expect(r).toEqual({ ok: true, free: true, orderId: 'order-1', accessKey: 'key-1' });
    expect(d.finalizeFree).toHaveBeenCalledWith('order-1');
    expect(d.createPaymentSession).not.toHaveBeenCalled();
  });

  it('merges duplicate lines and enforces max per order', async () => {
    const d = deps();
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 3 }, { ticketTypeId: GA, qty: 2 }]));
    expect(r).toMatchObject({ ok: false, status: 400, ticketTypeId: GA });
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it('rejects ticket types from another event', async () => {
    const r = await placeOrder(deps(), input([{ ticketTypeId: '00000000-0000-4000-8000-0000000000ff', qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a bad phone number before touching the database', async () => {
    const d = deps();
    expect(await placeOrder(d, input([{ ticketTypeId: GA, qty: 1 }], '12345'))).toMatchObject({ ok: false, status: 400 });
    expect(d.loadEvent).not.toHaveBeenCalled();
  });

  it('rejects an empty selection', async () => {
    expect(await placeOrder(deps(), input([{ ticketTypeId: GA, qty: 0 }]))).toMatchObject({ ok: false, status: 400 });
  });

  it('reports sold out as 409 naming the ticket type', async () => {
    const d = deps({ createOrder: vi.fn(async () => { throw new UnavailableError(GA); }) });
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 409, ticketTypeId: GA });
    expect(r.ok === false && r.error).toContain('General');
  });

  it('releases the hold when Razorpay is down', async () => {
    const d = deps({ createPaymentSession: vi.fn(async () => { throw new Error('503'); }) });
    const r = await placeOrder(d, input([{ ticketTypeId: GA, qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(d.failOrder).toHaveBeenCalledWith('order-1');
  });

  it('404s an event that is not on sale', async () => {
    const r = await placeOrder(deps({ loadEvent: vi.fn(async () => null) }), input([{ ticketTypeId: GA, qty: 1 }]));
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});
