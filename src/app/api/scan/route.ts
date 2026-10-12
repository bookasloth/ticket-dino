import { z } from 'zod';
import { report } from '@/lib/report';
import { userDb } from '@/lib/supabase/server';

const body = z.object({ token: z.string().min(1).max(200), eventId: z.guid() });

// One RPC round trip keeps scan-to-result well under 1 s. check_in is atomic: two devices scanning the
// same QR at once get exactly one "ok".
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ result: 'not_found' }, { status: 400 });
  const db = await userDb();
  const { data, error } = await db.rpc('check_in', { p_token: parsed.data.token, p_event_id: parsed.data.eventId });
  if (error) {
    const forbidden = error.message.includes('FORBIDDEN');
    if (!forbidden) report(error, { route: 'scan' });
    return Response.json({ result: forbidden ? 'forbidden' : 'error' }, { status: forbidden ? 403 : 500 });
  }
  return Response.json(data);
}
