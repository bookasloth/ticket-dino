'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SaleState } from '@/lib/availability';
import { formatINR } from '@/lib/money';
import { normalizeIndianPhone } from '@/lib/phone';
import { quote } from '@/lib/pricing';

type TicketType = { id: string; name: string; pricePaise: number; gstRate: number; maxPerOrder: number; state: SaleState; available: number };
type EventInfo = { id: string; title: string; feeBps: number; feeFlatPaise: number; feeGstRate: number };
type Pending = { orderId: string; razorpayOrderId: string; amountPaise: number; keyId: string; statusUrl: string };
type RazorpayCtor = new (opts: Record<string, unknown>) => { open(): void };

const STATE_LABEL: Record<SaleState, string> = { on_sale: '', sold_out: 'Sold out', not_started: 'Not on sale yet', ended: 'Sales closed' };

function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(w.Razorpay!);
    s.onerror = () => reject(new Error('Could not load the payment window.'));
    document.body.appendChild(s);
  });
}

export function CheckoutForm({ event, ticketTypes, utm }: { event: EventInfo; ticketTypes: TicketType[]; utm: Record<string, string> }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const items = ticketTypes
    .filter((t) => (qty[t.id] ?? 0) > 0)
    .map((t) => ({ ticketTypeId: t.id, qty: qty[t.id], unitPricePaise: t.pricePaise, gstRate: t.gstRate }));
  const q = items.length ? quote(items, event) : null;

  function setTypeQty(id: string, n: number) {
    setQty((prev) => ({ ...prev, [id]: n }));
    setPending(null); // changing the basket needs a fresh order
  }

  async function openRazorpay(p: Pending) {
    const Razorpay = await loadRazorpay();
    new Razorpay({
      key: p.keyId,
      order_id: p.razorpayOrderId,
      amount: p.amountPaise,
      currency: 'INR',
      name: 'TicketDino',
      description: event.title,
      prefill: { name: buyer.name, email: buyer.email, contact: buyer.phone },
      theme: { color: '#2e7d4f' },
      handler: () => router.push(p.statusUrl),
      modal: {
        ondismiss: () => setError('Payment not completed. Your tickets are held for 10 minutes. Tap Pay to try again.'),
      },
    }).open();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!normalizeIndianPhone(buyer.phone)) return setError('Enter a valid 10-digit Indian mobile number.');
    setBusy(true);
    try {
      if (pending) return await openRazorpay(pending);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          items: items.map(({ ticketTypeId, qty }) => ({ ticketTypeId, qty })),
          buyer,
          consent,
          utm,
        }),
      });
      const j = await res.json();
      if (!res.ok) return setError(j.error ?? 'Something went wrong. Please try again.');
      const statusUrl = `/orders/${j.orderId}?k=${encodeURIComponent(j.accessKey)}`;
      if (j.free) return router.push(statusUrl);
      const p: Pending = { orderId: j.orderId, razorpayOrderId: j.razorpayOrderId, amountPaise: j.amountPaise, keyId: j.keyId, statusUrl };
      setPending(p);
      await openRazorpay(p);
    } catch (err) {
      setError(err instanceof Error && err.message.includes('payment window') ? err.message : 'Network problem. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Tickets</legend>
        {ticketTypes.map((t) => {
          const max = Math.min(t.maxPerOrder, t.available);
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-muted-foreground">
                  {t.pricePaise === 0 ? 'Free' : formatINR(t.pricePaise)}
                  {t.state !== 'on_sale' && ` · ${STATE_LABEL[t.state]}`}
                </div>
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

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Your details</legend>
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
