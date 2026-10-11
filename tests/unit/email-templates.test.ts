import { describe, expect, it } from 'vitest';
import { lateRefundEmail, refundEmail, ticketsEmail } from '@/lib/email/templates';
import type { OrderEmailData } from '@/lib/tickets/load';

const d: OrderEmailData = {
  orderNo: 42,
  buyerName: '<script>alert(1)</script>',
  totalPaise: 122_720,
  organizerName: 'Timewheel Events',
  event: { title: 'Dino Fest', slug: 'dino-fest', startsAt: '2026-11-10T05:30:00Z', venue: 'Jio World Garden, Mumbai' },
  tickets: [
    { token: 'AAAAAAAAAAAAAAAAAAAAAA', ticketType: 'VIP', attendeeName: 'A' },
    { token: 'BBBBBBBBBBBBBBBBBBBBBB', ticketType: 'VIP', attendeeName: 'A' },
  ],
};

describe('email templates', () => {
  it('escapes buyer input', () => {
    expect(ticketsEmail(d).html).not.toContain('<script>');
    expect(ticketsEmail(d).html).toContain('&lt;script&gt;');
  });
  it('links every ticket', () => {
    const html = ticketsEmail(d).html;
    expect(html).toContain('/t/AAAAAAAAAAAAAAAAAAAAAA');
    expect(html).toContain('/t/BBBBBBBBBBBBBBBBBBBBBB');
    expect(ticketsEmail(d).subject).toBe('Your tickets for Dino Fest');
  });
  it('states refund amounts in rupees', () => {
    expect(refundEmail(d).html).toContain('₹1,227.20');
    expect(lateRefundEmail(d).html).toContain('₹1,227.20');
    expect(refundEmail(d).subject).toContain('TD-42');
  });
});
