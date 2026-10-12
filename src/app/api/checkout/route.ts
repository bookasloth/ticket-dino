import { checkoutInput, placeOrder } from '@/lib/checkout';
import { checkoutDeps } from '@/lib/checkout-deps';
import { normalizeIndianPhone } from '@/lib/phone';
import { allow, clientIp } from '@/lib/ratelimit';

const tooMany = () => Response.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429 });

export async function POST(req: Request) {
  if (!(await allow('checkoutIp', await clientIp()))) return tooMany();
  const parsed = checkoutInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Please check your details and try again.' }, { status: 400 });

  const phone = normalizeIndianPhone(parsed.data.buyer.phone);
  if (phone && !(await allow('checkoutPhone', phone))) return tooMany();

  const result = await placeOrder(checkoutDeps(), parsed.data);
  if (!result.ok) return Response.json({ error: result.error, ticketTypeId: result.ticketTypeId }, { status: result.status });
  return Response.json(result);
}
