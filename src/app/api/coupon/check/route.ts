import { z } from 'zod';
import { couponProblem } from '@/lib/checkout';
import { checkoutDeps } from '@/lib/checkout-deps';
import { allow, clientIp } from '@/lib/ratelimit';

const input = z.object({ eventId: z.guid(), code: z.string().trim().min(1).max(30), ticketTypeIds: z.array(z.guid()).max(20) });

/** Preview only: checkout re-validates and reserves the coupon atomically. Shares the checkout rate limit to slow code guessing. */
export async function POST(req: Request) {
  if (!(await allow('checkoutIp', await clientIp()))) {
    return Response.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429 });
  }
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a coupon code.' }, { status: 400 });
  const { eventId, code, ticketTypeIds } = parsed.data;

  const c = await checkoutDeps().loadCoupon!(eventId, code.toUpperCase());
  const items = ticketTypeIds.map((id) => ({ ticketTypeId: id, qty: 1, unitPricePaise: 0, gstRate: 0 }));
  const problem = couponProblem(c, items);
  if (problem || !c) return Response.json({ error: problem }, { status: 400 });
  return Response.json({ rule: { kind: c.kind, value: c.value, maxDiscountPaise: c.maxDiscountPaise, ticketTypeIds: c.ticketTypeIds } });
}
