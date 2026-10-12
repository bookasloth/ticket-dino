import { formatINR } from '@/lib/money';
import type { OrderEmailData } from '@/lib/tickets/load';
import { ticketUrl } from '@/lib/tickets/url';
import { formatIST } from '@/lib/time';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const layout = (body: string) =>
  `<!doctype html><html><body style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:16px;color:#111">` +
  `${body}<p style="color:#666;font-size:12px;margin-top:32px">Sent by TicketDino on behalf of the organizer. ` +
  `Need help? Reply to this email and quote your order number.</p></body></html>`;

const when = (d: OrderEmailData) =>
  `<p><strong>${escapeHtml(formatIST(d.event.startsAt, { dateStyle: 'full' }))}</strong>` +
  (d.event.venue ? `<br>${escapeHtml(d.event.venue)}` : '') + `</p>`;

export function ticketsEmail(d: OrderEmailData) {
  const links = d.tickets
    .map((t, i) => `<li><a href="${ticketUrl(t.token)}">Ticket ${i + 1}: ${escapeHtml(t.ticketType)}</a></li>`)
    .join('');
  return {
    subject: `Your tickets for ${d.event.title}`,
    html: layout(
      `<h1 style="font-size:20px">You're going to ${escapeHtml(d.event.title)}!</h1>` +
        `<p>Hi ${escapeHtml(d.buyerName)}, here are your tickets for order TD-${d.orderNo}.</p>` +
        when(d) +
        `<ul>${links}</ul>` +
        (d.extras.length ? `<p><strong>Extras:</strong> ${d.extras.map((x) => `${x.qty} × ${escapeHtml(x.name)}`).join(', ')}. Collect them at the counter with this email.</p>` : '') +
        (d.discountPaise > 0 ? `<p>You saved ${formatINR(d.discountPaise)} on this order.</p>` : '') +
        `<p>Show the QR code at the gate. Each code works once. Your tickets are also attached as a PDF.</p>`,
    ),
  };
}

export function refundEmail(d: OrderEmailData) {
  return {
    subject: `Refund for order TD-${d.orderNo}`,
    html: layout(
      `<p>Hi ${escapeHtml(d.buyerName)},</p>` +
        `<p>Your order TD-${d.orderNo} for ${escapeHtml(d.event.title)} has been refunded: ${formatINR(d.totalPaise)}. ` +
        `It usually reaches your account in 5–7 working days. The tickets on this order no longer work.</p>`,
    ),
  };
}

export function lateRefundEmail(d: OrderEmailData) {
  return {
    subject: `Sorry, ${d.event.title} sold out before your payment completed`,
    html: layout(
      `<p>Hi ${escapeHtml(d.buyerName)},</p>` +
        `<p>Your payment for order TD-${d.orderNo} reached us after the last tickets were sold. ` +
        `We've refunded the full ${formatINR(d.totalPaise)}; it usually reaches your account in 5–7 working days. ` +
        `We're sorry for the trouble.</p>`,
    ),
  };
}
