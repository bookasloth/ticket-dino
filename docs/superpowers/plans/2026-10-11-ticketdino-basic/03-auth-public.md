# Part 3 — Auth, seed and public pages

### Task 7: Supabase clients, staff login, seed data

**Files:**
- Create: `src/lib/supabase/admin.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/public.ts`, `src/lib/auth.ts`, `src/lib/ratelimit.ts`, `src/proxy.ts`, `src/app/login/page.tsx`, `src/app/login/LoginForm.tsx`, `src/app/login/actions.ts`, `supabase/seed.sql`

**Interfaces:**
- Produces:
  - `adminDb(): SupabaseClient` (service role, server-only)
  - `userDb(): Promise<SupabaseClient>` (cookie session)
  - `publicDb(): SupabaseClient` (anon, no cookies, cacheable)
  - `requireMember(roles?: Role[]): Promise<{ db; user; organizerId: string; role: Role }>` where `Role = 'owner'|'manager'|'staff'`. Default roles `['owner','manager']`. A staff-only user sent to an admin page is redirected to `/scan`.
  - `allow(bucket: 'checkoutIp'|'checkoutPhone'|'login', key: string): Promise<boolean>`
  - Seed logins (local only): `owner@ticketdino.test` / `dino-owner-123`, `gate@ticketdino.test` / `dino-gate-123`; published event slug `dino-fest-2026` with ticket types General Admission (₹499), VIP (₹1,499), Kids Pass (₹0).

- [ ] **Step 1: Clients**

`src/lib/supabase/admin.ts`:
```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service role: bypasses RLS. Only for server code that has already checked who is calling. */
export function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`src/lib/supabase/public.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

/** Anon, cookie-less: safe for cached public pages. RLS limits it to published data. */
export function publicDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}
```

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function userDb() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: proxy.ts refreshes the session instead
        }
      },
    },
  });
}
```

- [ ] **Step 2: Proxy (session refresh + guard)**

`src/proxy.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && (path.startsWith('/admin') || path.startsWith('/scan'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

// Public pages skip this entirely so they stay fast and cacheable.
export const config = { matcher: ['/admin/:path*', '/scan/:path*', '/api/scan', '/login'] };
```

- [ ] **Step 3: Auth helper and rate limiter**

`src/lib/auth.ts`:
```ts
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
```

`src/lib/ratelimit.ts`:
```ts
import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL ? Redis.fromEnv() : null;
const limiters = redis
  ? {
      checkoutIp: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:checkout:ip' }),
      checkoutPhone: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '10 m'), prefix: 'rl:checkout:phone' }),
      login: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:login' }),
    }
  : null;

export type Bucket = 'checkoutIp' | 'checkoutPhone' | 'login';

/** Brief rule 9. No-op without Upstash, except in Vercel production where it fails loudly. */
export async function allow(bucket: Bucket, key: string): Promise<boolean> {
  if (!limiters) {
    if (process.env.VERCEL_ENV === 'production') throw new Error('Rate limiting is not configured');
    return true;
  }
  return (await limiters[bucket].limit(key)).success;
}

export async function clientIp(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
```

- [ ] **Step 4: Login**

`src/app/login/actions.ts`:
```ts
'use server';
import { redirect } from 'next/navigation';
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
  const next = String(form.get('next') ?? '');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/admin');
}

export async function logout() {
  const db = await userDb();
  await db.auth.signOut();
  redirect('/login');
}
```

`src/app/login/LoginForm.tsx`:
```tsx
'use client';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
```

`src/app/login/page.tsx`:
```tsx
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
```

- [ ] **Step 5: Seed**

`supabase/seed.sql` (local only — test credentials):
```sql
-- Local development seed. Test credentials only; never used in production.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'owner@ticketdino.test', extensions.crypt('dino-owner-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'gate@ticketdino.test', extensions.crypt('dino-gate-123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users where email like '%@ticketdino.test';

insert into organizers (id, name, slug, legal_name)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Timewheel Events', 'timewheel', 'Timewheel Internet Pvt Ltd');
insert into organizer_members (organizer_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'staff');

insert into venues (id, organizer_id, name, address, city, maps_url)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Jio World Garden',
        'BKC, Bandra East', 'Mumbai', 'https://maps.google.com/?q=Jio+World+Garden');

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dino-fest-2026',
        'Dino Fest 2026', 'Music', 'A day of live music, food and giant dinosaurs.',
        '[{"q":"Is there parking?","a":"Yes, paid parking at the venue."},{"q":"Age limit?","a":"All ages. Kids under 12 need a Kids Pass."}]',
        date_trunc('day', now() + interval '30 days') + interval '11 hours',
        date_trunc('day', now() + interval '30 days') + interval '17 hours',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18,
        'Refunds up to 7 days before the event, minus the booking fee.');

insert into event_staff (organizer_id, event_id, user_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'General Admission', 49900, 18, 300, 10, now() + interval '29 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'VIP', 149900, 18, 50, 4, now() + interval '29 days', 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Kids Pass', 0, 0, 20, 2, now() + interval '29 days', 3);

-- Job secrets read by pg_cron (Task 13). Local values only.
select vault.create_secret('http://host.docker.internal:3000', 'app_url');
select vault.create_secret('local-cron-secret', 'cron_secret');
```

- [ ] **Step 6: Verify manually**

Run: `supabase db reset && pnpm dev`, then open `http://localhost:3000/admin`.
Expected: you're redirected to `/login?next=%2Fadmin`. Sign in as `owner@ticketdino.test`; `/admin` returns 404 until Task 14 — that's fine. A wrong password shows "Wrong email or password."
Also run `pnpm test:db` (seed must not break tests: they use their own fixture ids).

- [ ] **Step 7: Commit**

```bash
git add src supabase/seed.sql
git commit -m "feat: Supabase clients, staff login, proxy guard, local seed"
```

---

### Task 8: Public layout, event page and legal pages

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `next.config.ts`
- Create: `src/app/e/[slug]/page.tsx`, `src/app/e/[slug]/data.ts`, `src/app/(legal)/LegalPage.tsx`, `src/app/(legal)/terms/page.tsx`, `src/app/(legal)/privacy/page.tsx`, `src/app/(legal)/refund-policy/page.tsx`, `src/app/(legal)/contact/page.tsx`

**Interfaces:**
- Consumes: `publicDb`, `formatIST`, `formatINR`, `saleState`, `available`.
- Produces: `getPublicEvent(slug): Promise<PublicEvent | null>` from `src/app/e/[slug]/data.ts` (reused by checkout, Task 10), where:
```ts
type PublicEvent = {
  id: string; slug: string; title: string; category: string | null; description: string | null;
  faqs: { q: string; a: string }[]; poster_url: string | null; starts_at: string; ends_at: string;
  status: 'published' | 'cancelled' | 'completed';
  fee_bps: number; fee_flat_paise: number; fee_gst_rate: number; refund_policy: string | null;
  venue: { name: string; address: string | null; city: string | null; maps_url: string | null } | null;
  organizer: { name: string };
  ticket_types: { id: string; name: string; price_paise: number; gst_rate: number; capacity: number;
    sold_count: number; held_count: number; max_per_order: number; sale_starts_at: string; sale_ends_at: string; sort: number }[];
};
```

- [ ] **Step 1: next.config.ts**

```ts
import type { NextConfig } from 'next';

const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321');
const isLocal = ['127.0.0.1', 'localhost'].includes(supabase.hostname);
const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const config: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  experimental: { serverActions: { bodySizeLimit: '6mb' } }, // poster uploads
  images: {
    unoptimized: isLocal, // Next blocks optimizing images from local IPs
    remotePatterns: [
      {
        protocol: supabase.protocol.replace(':', '') as 'http' | 'https',
        hostname: supabase.hostname,
        port: supabase.port,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return ['/t/:path*', '/orders/:path*', '/admin/:path*', '/scan/:path*', '/login'].map((source) => ({
      source,
      headers: noindex,
    }));
  },
};

export default config;
```

- [ ] **Step 2: Root layout and home**

`src/app/layout.tsx` (keep the Geist font setup create-next-app generated; replace the metadata and body):
```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'TicketDino',
  description: 'Tickets for events across India.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className={`${geist.variable} flex min-h-dvh flex-col bg-background font-sans text-foreground antialiased`}>
        <header className="border-b">
          <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
            {/* ponytail: text logo until the real one lands */}
            <Link href="/" className="text-lg font-bold text-primary">TicketDino</Link>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t text-sm text-muted-foreground">
          <nav className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-2 px-4 py-6">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund-policy">Refunds &amp; cancellations</Link>
            <Link href="/contact">Contact</Link>
            <span className="ml-auto">© Timewheel Internet Pvt Ltd</span>
          </nav>
        </footer>
      </body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">TicketDino</h1>
      <p className="mt-2 text-muted-foreground">Tickets for live events across India. Pay by UPI or card, get your QR ticket in seconds.</p>
    </main>
  );
}
```

- [ ] **Step 3: Event data loader**

`src/app/e/[slug]/data.ts`:
```ts
import { cache } from 'react';
import { publicDb } from '@/lib/supabase/public';

export type PublicTicketType = {
  id: string; name: string; price_paise: number; gst_rate: number; capacity: number; sold_count: number;
  held_count: number; max_per_order: number; sale_starts_at: string; sale_ends_at: string; sort: number;
};
export type PublicEvent = {
  id: string; slug: string; title: string; category: string | null; description: string | null;
  faqs: { q: string; a: string }[]; poster_url: string | null; starts_at: string; ends_at: string;
  status: 'published' | 'cancelled' | 'completed';
  fee_bps: number; fee_flat_paise: number; fee_gst_rate: number; refund_policy: string | null;
  venue: { name: string; address: string | null; city: string | null; maps_url: string | null } | null;
  organizer: { name: string };
  ticket_types: PublicTicketType[];
};

export const getPublicEvent = cache(async (slug: string): Promise<PublicEvent | null> => {
  const { data } = await publicDb()
    .from('events')
    .select(
      `id, slug, title, category, description, faqs, poster_url, starts_at, ends_at, status,
       fee_bps, fee_flat_paise, fee_gst_rate, refund_policy,
       venue:venues(name, address, city, maps_url), organizer:organizers(name),
       ticket_types(id, name, price_paise, gst_rate, capacity, sold_count, held_count, max_per_order,
                    sale_starts_at, sale_ends_at, sort)`,
    )
    .eq('slug', slug)
    .neq('status', 'draft')
    .maybeSingle();
  if (!data) return null;
  const event = data as unknown as PublicEvent;
  event.ticket_types.sort((a, b) => a.sort - b.sort);
  return event;
});
```
PostgREST returns `numeric` as a JSON number. If it ever comes back as a string, map `Number()` over `gst_rate` and `fee_gst_rate` here.

- [ ] **Step 4: Event page**

`src/app/e/[slug]/page.tsx`:
```tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { saleState } from '@/lib/availability';
import { formatINR } from '@/lib/money';
import { formatIST } from '@/lib/time';
import { getPublicEvent } from './data';

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getPublicEvent((await params).slug);
  if (!event) return {};
  const description = `${formatIST(event.starts_at)} · ${event.venue?.name ?? ''}`.trim();
  return {
    title: `${event.title} · TicketDino`,
    description,
    openGraph: { title: event.title, description, images: event.poster_url ? [event.poster_url] : [] },
  };
}

const LABEL = { on_sale: null, sold_out: 'Sold out', not_started: 'Not on sale yet', ended: 'Sales closed' } as const;

export default async function EventPage({ params }: Props) {
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();

  const states = event.ticket_types.map((t) => saleState(t));
  const canBuy = event.status === 'published' && states.includes('on_sale');
  const mapsUrl =
    event.venue?.maps_url ??
    (event.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue.name} ${event.venue.city ?? ''}`)}` : null);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-6">
      {event.poster_url && (
        <Image src={event.poster_url} alt={event.title} width={1200} height={630} priority
               className="mb-6 aspect-[1200/630] w-full rounded-xl object-cover" sizes="(max-width: 768px) 100vw, 768px" />
      )}
      {event.status === 'cancelled' && (
        <p className="mb-4 rounded-md bg-destructive/10 p-3 text-destructive">This event has been cancelled.</p>
      )}
      <h1 className="text-2xl font-bold sm:text-3xl">{event.title}</h1>
      <p className="mt-1 text-muted-foreground">by {event.organizer.name}</p>

      <dl className="mt-4 space-y-2">
        <div><dt className="sr-only">When</dt><dd>{formatIST(event.starts_at, { dateStyle: 'full' })}</dd></div>
        {event.venue && (
          <div>
            <dt className="sr-only">Where</dt>
            <dd>
              {event.venue.name}{event.venue.city ? `, ${event.venue.city}` : ''}
              {mapsUrl && <> · <a className="text-primary underline" href={mapsUrl} target="_blank" rel="noopener noreferrer">Map</a></>}
            </dd>
          </div>
        )}
      </dl>

      <section className="mt-6 space-y-2" aria-label="Tickets">
        {event.ticket_types.map((t, i) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
            <span className="font-medium">{t.name}</span>
            <span className="flex items-center gap-2">
              {LABEL[states[i]] && <Badge variant="secondary">{LABEL[states[i]]}</Badge>}
              <span>{t.price_paise === 0 ? 'Free' : formatINR(t.price_paise)}</span>
            </span>
          </div>
        ))}
        {event.ticket_types.some((t) => t.gst_rate > 0) && (
          <p className="text-xs text-muted-foreground">Prices exclude GST and booking fee, shown before payment.</p>
        )}
      </section>

      {event.description && <section className="mt-8 whitespace-pre-line">{event.description}</section>}

      {event.faqs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">FAQs</h2>
          {event.faqs.map((f) => (
            <details key={f.q} className="border-b py-2">
              <summary className="cursor-pointer font-medium">{f.q}</summary>
              <p className="mt-1 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {event.refund_policy && (
        <section className="mt-8 text-sm text-muted-foreground">
          <h2 className="mb-1 font-semibold text-foreground">Refund policy</h2>
          <p>{event.refund_policy}</p>
        </section>
      )}

      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <Button asChild size="lg" className="w-full">
              <Link href={`/e/${event.slug}/checkout`}>Get tickets</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Legal pages** (draft copy — must be reviewed before Razorpay live activation; tracked as an open item in the spec)

`src/app/(legal)/LegalPage.tsx`:
```tsx
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">Last updated: 11 October 2026</p>
      {children}
    </main>
  );
}
```

`src/app/(legal)/terms/page.tsx`:
```tsx
import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Terms of use · TicketDino' };
export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>TicketDino is operated by Timewheel Internet Pvt Ltd (“we”). By buying a ticket you agree to these terms.</p>
      <h2>Tickets</h2>
      <p>A ticket admits one person to the event named on it. Each QR code can be scanned once. Do not share it: the first scan wins.</p>
      <h2>Payments</h2>
      <p>Payments are processed by Razorpay. We never see or store your card details. Prices include the booking fee and GST shown at checkout.</p>
      <h2>Event changes</h2>
      <p>The organizer may change the time or venue. If an event is cancelled you get a full refund.</p>
      <h2>Entry</h2>
      <p>The organizer and venue may refuse entry for safety reasons or to anyone without a valid ticket.</p>
      <h2>Contact</h2>
      <p>Questions? See our <a className="underline" href="/contact">contact page</a>.</p>
    </LegalPage>
  );
}
```

`src/app/(legal)/privacy/page.tsx`:
```tsx
import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Privacy policy · TicketDino' };
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>We collect your name, email and phone number to issue and deliver your tickets, verify entry and contact you about the event.</p>
      <h2>Who sees your data</h2>
      <p>Only the organizer of the event you booked and our support team. We do not sell your data.</p>
      <h2>Payments</h2>
      <p>Card and UPI details are handled by Razorpay and never reach our servers.</p>
      <h2>Your rights (DPDP Act, 2023)</h2>
      <p>You can ask us to access, correct or delete your data by writing to the email on our contact page. We keep order records as long as tax law requires.</p>
      <h2>Security</h2>
      <p>Data is encrypted in transit and access is limited to authorised staff. We will notify you and the authorities of any breach as the law requires.</p>
    </LegalPage>
  );
}
```

`src/app/(legal)/refund-policy/page.tsx`:
```tsx
import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Refunds and cancellations · TicketDino' };
export default function RefundPolicy() {
  return (
    <LegalPage title="Refunds and cancellations">
      <p>Each event sets its own refund policy, shown on the event page before you pay.</p>
      <h2>Cancelled events</h2>
      <p>If the organizer cancels, you get a full refund to the original payment method.</p>
      <h2>Payment problems</h2>
      <p>If money was debited but no ticket was issued, it is refunded automatically, usually within 5–7 working days.</p>
      <h2>How refunds reach you</h2>
      <p>Refunds go back to the original payment method through Razorpay. Banks usually take 5–7 working days.</p>
    </LegalPage>
  );
}
```

`src/app/(legal)/contact/page.tsx`:
```tsx
import { LegalPage } from '../LegalPage';
export const metadata = { title: 'Contact · TicketDino' };
export default function Contact() {
  const email = process.env.SUPPORT_EMAIL ?? 'support@example.com';
  return (
    <LegalPage title="Contact us">
      <p>TicketDino is operated by <strong>Timewheel Internet Pvt Ltd</strong>.</p>
      <p>Email: <a className="underline" href={`mailto:${email}`}>{email}</a></p>
      <p>Please include your order number (it starts with TD-) so we can help faster.</p>
    </LegalPage>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm dev`, open `http://localhost:3000/e/dino-fest-2026`.
Expected: title, IST date, venue with a Map link, three ticket rows (Kids Pass shows "Free"), FAQs, a sticky "Get tickets" button. `/e/nope` returns 404. All four legal pages render and are linked from the footer.

- [ ] **Step 7: Commit**

```bash
git add src next.config.ts
git commit -m "feat: public event page, layout and legal pages"
```
