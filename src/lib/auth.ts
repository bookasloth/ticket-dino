import 'server-only';
import { redirect } from 'next/navigation';
import { userDb } from './supabase/server';

export type Role = 'owner' | 'manager' | 'staff';

// ponytail: first matching membership wins; add an organizer switcher when outside organizers arrive.
export async function requireMember(roles: Role[] = ['owner', 'manager']) {
  const db = await userDb();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect('/login');

  const { data: members } = await db.from('organizer_members').select('organizer_id, role').eq('user_id', user.id);
  const match = members?.find((m) => roles.includes(m.role as Role));
  if (match) return { db, user, organizerId: match.organizer_id as string, role: match.role as Role };

  const { data: sa } = await db.from('super_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (sa) {
    const { data: org } = await db.from('organizers').select('id').order('created_at').limit(1).single();
    if (org) return { db, user, organizerId: org.id as string, role: 'owner' as Role };
  }
  if (members?.some((m) => m.role === 'staff')) redirect('/scan');
  redirect('/login?error=forbidden');
}
