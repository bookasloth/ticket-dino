import { isCron } from '@/lib/cron';
import { sendPendingNotifications } from '@/lib/email/send';

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isCron(req)) return new Response('unauthorized', { status: 401 });
  return Response.json({ sent: await sendPendingNotifications() });
}
