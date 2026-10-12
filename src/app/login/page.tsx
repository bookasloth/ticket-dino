import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in · TicketDino', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = '/admin', error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Organizer sign in</h1>
      {error === 'forbidden' && (
        <p className="mb-4 text-sm text-destructive">This account has no access to an organizer.</p>
      )}
      <LoginForm next={next} />
    </main>
  );
}
