import { z } from 'zod';
import { adminDb } from '@/lib/supabase/admin';
import { safeEqual } from '@/lib/webhook';

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = new URL(req.url).searchParams.get('k') ?? '';
  if (!z.guid().safeParse(id).success) return notFound();

  const { data } = await adminDb()
    .from('orders')
    .select('status, number, access_key, tickets(qr_token, created_at)')
    .eq('id', id)
    .maybeSingle();
  if (!data || !safeEqual(data.access_key, key)) return notFound();

  const tickets = data.status === 'paid'
    ? (data.tickets as { qr_token: string; created_at: string }[])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((t) => t.qr_token)
    : [];
  return Response.json({ status: data.status, number: data.number, tickets }, { headers: { 'cache-control': 'no-store' } });
}
