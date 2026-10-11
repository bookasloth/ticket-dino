import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { requireMember } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { db, organizerId, user } = await requireMember();
  const { data: org } = await db.from('organizers').select('name').eq('id', organizerId).single();
  return (
    <div>
      <div className="border-b bg-muted/40">
        <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2 text-sm">
          <Link href="/admin" className="font-semibold">{org?.name ?? 'Admin'}</Link>
          <Link href="/scan">Scanner</Link>
          <span className="ml-auto hidden text-muted-foreground sm:inline">{user.email}</span>
          <form action={logout}><button className="underline">Sign out</button></form>
        </nav>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
