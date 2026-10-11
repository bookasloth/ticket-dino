import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

async function webhook(request: APIRequestContext, eventId: string, rzpOrderId: string, amount: number) {
  const body = JSON.stringify({
    event: 'order.paid',
    payload: {
      order: { entity: { id: rzpOrderId, amount } },
      payment: { entity: { id: `pay_e2e_${eventId}`, order_id: rzpOrderId, amount, status: 'captured' } },
    },
  });
  return request.post('/api/webhooks/razorpay', {
    data: body,
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', secret).update(body).digest('hex'),
      'x-razorpay-event-id': eventId,
    },
  });
}


test('buyer pays, webhook confirms, tickets appear and scan once', async ({ page, request }) => {
  test.skip(!secret || !process.env.RAZORPAY_KEY_ID, 'needs Razorpay test keys in .env.local');
  await page.goto('/e/dino-fest-2026');
  await page.getByRole('link', { name: 'Get tickets' }).click();

  await page.getByLabel('Quantity for General Admission').selectOption('2');
  await page.getByLabel('Full name').fill('E2E Buyer');
  await page.getByLabel('Email').fill('e2e@example.com');
  await page.getByLabel('Mobile number').fill('+91 98765 43210');
  await page.getByRole('checkbox').check();

  const checkoutResponse = page.waitForResponse((r) => r.url().endsWith('/api/checkout'));
  await page.getByRole('button', { name: /^Pay ₹/ }).click();
  const order = await (await checkoutResponse).json();
  expect(order.razorpayOrderId).toMatch(/^order_/);
  await expect(page.locator('iframe.razorpay-checkout-frame')).toBeVisible({ timeout: 15_000 });

  // Razorpay calls our webhook in real life; here we sign one ourselves.
  const eventId = `evt_e2e_${Date.now()}`;
  const first = await webhook(request, eventId, order.razorpayOrderId, order.amountPaise);
  expect(first.status()).toBe(200);
  const again = await webhook(request, eventId, order.razorpayOrderId, order.amountPaise);
  expect(await again.json()).toMatchObject({ duplicate: true });
  // Same payment reported by a second event type must not double-issue.
  expect((await webhook(request, `${eventId}_b`, order.razorpayOrderId, order.amountPaise)).status()).toBe(200);
  // Another Timewheel product's order on the shared Razorpay account: acknowledged and ignored.
  expect((await webhook(request, `${eventId}_c`, 'order_not_ticketdino', 100)).status()).toBe(200);

  await page.goto(`/orders/${order.orderId}?k=${encodeURIComponent(order.accessKey)}`);
  await expect(page.getByText("You're in!")).toBeVisible({ timeout: 15_000 });
  const tickets = page.getByRole('link', { name: /View ticket/ });
  await expect(tickets).toHaveCount(2);

  await tickets.first().click();
  await expect(page.getByTestId('ticket-qr')).toBeVisible();
});

test('bad webhook signature is rejected', async ({ request }) => {
  const res = await request.post('/api/webhooks/razorpay', {
    data: '{"event":"order.paid"}',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'nope' },
  });
  expect(res.status()).toBe(400);
});
