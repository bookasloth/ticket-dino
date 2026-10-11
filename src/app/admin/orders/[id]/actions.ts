'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import type { ActionState } from '@/app/admin/events/actions';
import { requireMember } from '@/lib/auth';
import { sendPendingNotifications } from '@/lib/email/send';
import { report } from '@/lib/report';

export async function markRefunded(_: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireMember();
  const orderId = String(form.get('order_id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!reason) return { error: 'Add a reason for the refund.' };
  if (form.get('confirm') !== 'on') return { error: 'Confirm that you have already refunded this payment in the Razorpay dashboard.' };

  const { error } = await db.rpc('mark_order_refunded', { p_order_id: orderId, p_reason: reason.slice(0, 500) });
  if (error) {
    if (error.message.includes('NOT_PAID')) return { error: 'Only paid orders can be marked refunded.' };
    if (error.message.includes('FORBIDDEN')) return { error: "You don't have permission to refund this order." };
    return { error: error.message };
  }
  after(() => sendPendingNotifications(orderId).catch((e) => report(e, { orderId })));
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: 'Marked refunded. The tickets are void and the buyer is being emailed.' };
}
