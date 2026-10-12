'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SaleState } from '@/lib/availability';
import { checkoutKey } from '@/lib/checkout-key';
import { formatINR } from '@/lib/money';
import { normalizeIndianPhone } from '@/lib/phone';
import { quote, type CouponRule } from '@/lib/pricing';

type TicketType = {
  id: string; name: string; pricePaise: number; gstRate: number; maxPerOrder: number; state: SaleState; available: number;
  groupMinQty: number | null; groupPct: number | null;
};
type Addon = { id: string; name: string; pricePaise: number; gstRate: number; maxPerOrder: number; available: number };
type EventInfo = { id: string; title: string; feeBps: number; feeFlatPaise: number; feeGstRate: number };
type Pending = { key: string; orderId: string; sessionId: string; amountPaise: number; statusUrl: string };
type ZPaymentsCtor = new (config: object) => {
  requestPaymentMethod(options: object): Promise<{ payment_id: string }>;
  close(): Promise<void>;
};

const STATE_LABEL: Record<SaleState, string> = { on_sale: '', sold_out: 'Sold out', not_started: 'Not on sale yet', ended: 'Sales closed' };

function loadZoho(): Promise<ZPaymentsCtor> {
  const w = window as unknown as { ZPayments?: ZPaymentsCtor };
  if (w.ZPayments) return Promise.resolve(w.ZPayments);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://static.zohocdn.com/zpay/zpay-js/v1/zpayments.js';
    s.onload = () => resolve(w.ZPayments!);
    s.onerror = () => reject(new Error('Could not load the payment window.'));
    document.body.appendChild(s);
  });
}

export function CheckoutForm({ event, ticketTypes, addons = [], utm }: {
  event: EventInfo; ticketTypes: TicketType[]; addons?: Addon[]; utm: Record<string, string>;
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<(CouponRule & { code: string }) | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  const items = ticketTypes
    .filter((t) => (qty[t.id] ?? 0) > 0)
    .map((t) => ({ ticketTypeId: t.id, qty: qty[t.id], unitPricePaise: t.pricePaise, gstRate: t.gstRate, groupMinQty: t.groupMinQty, groupPct: t.groupPct }));
  const extras = addons
    .filter((a) => (addonQty[a.id] ?? 0) > 0)
    .map((a) => ({ ticketTypeId: a.id, qty: addonQty[a.id], unitPricePaise: a.pricePaise, gstRate: a.gstRate, addon: true }));
  const q = items.length ? quote([...items, ...extras], event, coupon) : null;

  async function applyCoupon() {
    setCouponMsg(null);
    const res = await fetch('/api/coupon/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, code, ticketTypeIds: items.map((i) => i.ticketTypeId) }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok || !j.rule) {
      setCoupon(null);
      return setCouponMsg(j.error ?? 'Could not check that code. Try again.');
    }
    setCoupon({ ...j.rule, code: code.trim().toUpperCase() });
    setPending(null);
  }

  function setTypeQty(id: string, n: number) {
    setQty((prev) => ({ ...prev, [id]: n }));
    setPending(null); // changing the basket needs a fresh order
  }

  async function openPayment(p: Pending) {
    const ZPayments = await loadZoho();
    const zp = new ZPayments({
      account_id: process.env.NEXT_PUBLIC_ZOHO_PAY_ACCOUNT_ID,
      domain: 'IN',
      otherOptions: {
        api_key: process.env.NEXT_PUBLIC_ZOHO_PAY_API_KEY,
        ...(process.env.NEXT_PUBLIC_ZOHO_PAY_SANDBOX === 'true' && { is_test_mode: true }),
      },
    });
    try {
      const { payment_id } = await zp.requestPaymentMethod({
        amount: (p.amountPaise / 100).toFixed(2),
        currency_code: 'INR',
        currency_symbol: '₹',
        payments_session_id: p.sessionId,
        business: 'TicketDino',
        description: event.title,
        reference_number: p.orderId,
        address: { name: buyer.name, email: buyer.email, phone: buyer.phone },
      });
      // The server re-checks with Zoho; the order page then shows tickets (or "processing" for slow UPI).
      await fetch('/api/zoho/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: payment_id }),
      }).catch(() => null);
      router.push(p.statusUrl);
    } catch (e) {
      if ((e as { code?: string }).code === 'widget_closed') {
        setError('Payment not completed. Your tickets are held for 10 minutes. Tap Pay to try again.');
      } else {
        setError('Payment failed. No money was taken. Please try again.');
      }
    } finally {
      await zp.close().catch(() => {});
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalizeIndianPhone(buyer.phone)) return setError('Enter a valid 10-digit Indian mobile number.');
    setBusy(true);
    try {
      const key = `${checkoutKey([...items, ...extras], buyer)}|${coupon?.code ?? ''}`;
      // Reuse the open payment session only if nothing changed; a corrected email must not keep the old one.
      if (pending?.key === key) return await openPayment(pending);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          items: items.map(({ ticketTypeId, qty }) => ({ ticketTypeId, qty })),
          addons: extras.map(({ ticketTypeId, qty }) => ({ addonId: ticketTypeId, qty })),
          couponCode: coupon?.code,
          buyer,
          consent,
          utm,
        }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? 'Something went wrong. Please try again.');
      const statusUrl = `/orders/${j.orderId}?k=${encodeURIComponent(j.accessKey)}`;
      if (j.free) return router.push(statusUrl);
      const p: Pending = { key, orderId: j.orderId, sessionId: j.paymentSessionId, amountPaise: j.amountPaise, statusUrl };
      setPending(p);
      await openPayment(p);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('payment window') ? err.message : 'Network problem. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-3 font-display text-xl">Tickets</legend>
        {ticketTypes.map((t) => {
          const max = Math.min(t.maxPerOrder, t.available);
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 border-b py-3">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-muted-foreground">
                  {t.pricePaise === 0 ? 'Free' : formatINR(t.pricePaise)}
                  {t.state !== 'on_sale' && ` · ${STATE_LABEL[t.state]}`}
                </div>
                {t.groupMinQty && t.groupPct && (
                  <div className="text-xs font-medium text-[#6b5a2e]">Book {t.groupMinQty}+ and save {t.groupPct}%</div>
                )}
              </div>
              <select
                aria-label={`Quantity for ${t.name}`}
                className="h-10 rounded-md border bg-background px-2"
                disabled={t.state !== 'on_sale'}
                value={qty[t.id] ?? 0}
                onChange={(e) => setTypeQty(t.id, Number(e.target.value))}
              >
                {Array.from({ length: (t.state === 'on_sale' ? max : 0) + 1 }, (_, n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          );
        })}
      </fieldset>

      {addons.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-3 font-display text-xl">Add extras</legend>
          {addons.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 border-b py-3">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-sm text-muted-foreground">{a.available > 0 ? formatINR(a.pricePaise) : 'Sold out'}</div>
              </div>
              <select
                aria-label={`Quantity for ${a.name}`}
                className="h-10 rounded-md border bg-background px-2"
                disabled={a.available === 0}
                value={addonQty[a.id] ?? 0}
                onChange={(e) => { setAddonQty((p) => ({ ...p, [a.id]: Number(e.target.value) })); setPending(null); }}
              >
                {Array.from({ length: Math.min(a.maxPerOrder, a.available) + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          ))}
        </fieldset>
      )}

      <div className="space-y-1">
        <Label htmlFor="coupon">Coupon code</Label>
        <div className="flex gap-2">
          <Input id="coupon" value={code} placeholder="e.g. DIWALI20" autoCapitalize="characters"
                 onChange={(e) => { setCode(e.target.value); if (coupon) { setCoupon(null); setPending(null); } }} />
          <Button type="button" variant="outline" disabled={!code.trim() || !items.length} onClick={applyCoupon}>Apply</Button>
        </div>
        {coupon && <p className="text-sm font-medium text-[#6b5a2e]">{coupon.code} applied</p>}
        {couponMsg && <p className="text-sm text-destructive">{couponMsg}</p>}
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-3 font-display text-xl">Your details</legend>
        <div className="space-y-1">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" required maxLength={100} value={buyer.name}
                 onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={buyer.email}
                 onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />
          <p className="text-xs text-muted-foreground">We'll email your tickets here.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">Mobile number</Label>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" required placeholder="98765 43210" value={buyer.phone}
                 onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree to the <Link className="underline" href="/terms">terms</Link> and to TicketDino and the organizer using my
            details to issue tickets and contact me about this event (<Link className="underline" href="/privacy">privacy policy</Link>).
          </span>
        </label>
      </fieldset>

      {q && (
        <dl className="space-y-1 rounded-lg bg-muted p-4 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatINR(q.subtotalPaise)}</dd></div>
          {q.discountPaise > 0 && (
            <div className="flex justify-between text-[#6b5a2e]"><dt>Discount</dt><dd>−{formatINR(q.discountPaise)}</dd></div>
          )}
          <div className="flex justify-between"><dt>Booking fee</dt><dd>{formatINR(q.feePaise)}</dd></div>
          <div className="flex justify-between"><dt>GST</dt><dd>{formatINR(q.gstPaise)}</dd></div>
          <div className="flex justify-between border-t pt-1 font-semibold"><dt>Total</dt><dd>{formatINR(q.totalPaise)}</dd></div>
        </dl>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={!q || busy}>
        {busy ? 'Please wait…' : !q ? 'Choose tickets' : q.totalPaise === 0 ? 'Get free tickets' : `Pay ${formatINR(q.totalPaise)}`}
      </Button>
      {pending && (
        <p className="text-center text-sm">
          Already paid? <Link className="underline" href={pending.statusUrl}>Check your order status</Link>
        </p>
      )}
    </form>
  );
}
