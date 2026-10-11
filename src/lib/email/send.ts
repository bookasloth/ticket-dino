import 'server-only';
import { Resend } from 'resend';
import { report } from '@/lib/report';
import { adminDb } from '@/lib/supabase/admin';
import { loadOrderEmailData } from '@/lib/tickets/load';
import { renderTicketsPdf } from '@/lib/tickets/pdf';
import { lateRefundEmail, refundEmail, ticketsEmail } from './templates';

type NotificationRow = { id: string; order_id: string; template: 'tickets' | 'refund' | 'late_refund'; recipient: string };

const from = (organizer: string) => `${organizer.replace(/[<>"\r\n]/g, '')} via TicketDino <${process.env.EMAIL_FROM}>`;
const TEMPLATES = { tickets: ticketsEmail, refund: refundEmail, late_refund: lateRefundEmail };

/** Sends claimed notifications. Safe to run concurrently (rows are claimed with SKIP LOCKED). */
export async function sendPendingNotifications(orderId?: string): Promise<number> {
  const db = adminDb();
  const { data, error } = await db.rpc('claim_notifications', { p_order_id: orderId ?? null, p_limit: 20 });
  if (error) throw new Error(`claim_notifications: ${error.message}`);
  const rows = (data ?? []) as NotificationRow[];
  let resend: Resend | null = null;

  for (const n of rows) {
    try {
      resend ??= new Resend(process.env.RESEND_API_KEY); // throws without a key: record it on the row, don't strand claimed rows
      const d = await loadOrderEmailData(db, n.order_id);
      const { subject, html } = TEMPLATES[n.template](d);
      const attachments =
        n.template === 'tickets' ? [{ filename: `tickets-TD-${d.orderNo}.pdf`, content: await renderTicketsPdf(d) }] : undefined;
      const { data: sent, error: sendError } = await resend.emails.send(
        { from: from(d.organizerName), to: n.recipient, replyTo: process.env.SUPPORT_EMAIL, subject, html, attachments },
        { idempotencyKey: `notification-${n.id}` },
      );
      if (sendError) throw new Error(sendError.message);
      await db
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: sent?.id ?? null, last_error: null })
        .eq('id', n.id);
    } catch (e) {
      await db.from('notifications').update({ status: 'failed', last_error: String(e).slice(0, 500) }).eq('id', n.id);
      report(e, { notificationId: n.id });
    }
  }
  return rows.length;
}
