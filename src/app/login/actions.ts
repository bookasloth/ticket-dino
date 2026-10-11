'use server';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/redirect';
import { allow, clientIp } from '@/lib/ratelimit';
import { userDb } from '@/lib/supabase/server';

export type LoginState = { error?: string } | null;

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  if (!(await allow('login', await clientIp()))) return { error: 'Too many attempts. Try again in a minute.' };
  const db = await userDb();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { error: 'Wrong email or password.' };
  redirect(safeNext(String(form.get('next') ?? '')));
}

export async function logout() {
  const db = await userDb();
  await db.auth.signOut();
  redirect('/login');
}
