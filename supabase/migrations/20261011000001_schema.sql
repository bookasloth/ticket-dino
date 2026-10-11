-- Money: integer paise. Time: timestamptz (UTC). Every tenant table: organizer_id.

create or replace function public.gen_token() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_');  -- 128-bit, 22 chars
$$;

create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legal_name text,
  gstin text,
  logo_url text,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.organizer_members (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (organizer_id, user_id)
);

create table public.super_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  name text not null,
  address text,
  city text,
  lat double precision,
  lng double precision,
  maps_url text,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  title text not null,
  category text,
  description text,
  faqs jsonb not null default '[]',
  poster_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_id uuid references public.venues,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  fee_bps int not null default 0 check (fee_bps between 0 and 10000),
  fee_flat_paise int not null default 0 check (fee_flat_paise >= 0),
  fee_gst_rate numeric(5,2) not null default 18 check (fee_gst_rate between 0 and 40),
  refund_policy text,
  transfer_cutoff_hours int not null default 24,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.event_staff (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  unique (event_id, user_id)
);

create table public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  price_paise int not null check (price_paise >= 0),
  gst_rate numeric(5,2) not null default 18 check (gst_rate between 0 and 40),
  capacity int not null check (capacity >= 0),
  sold_count int not null default 0 check (sold_count >= 0),
  held_count int not null default 0 check (held_count >= 0),
  max_per_order int not null default 10 check (max_per_order > 0),
  sale_starts_at timestamptz not null default now(),
  sale_ends_at timestamptz not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  constraint ticket_types_capacity check (sold_count + held_count <= capacity)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,  -- shown as TD-<number>
  organizer_id uuid not null references public.organizers,
  event_id uuid not null references public.events,
  access_key text not null default public.gen_token(),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text not null,
  subtotal_paise int not null check (subtotal_paise >= 0),
  fee_paise int not null check (fee_paise >= 0),
  gst_paise int not null check (gst_paise >= 0),
  total_paise int not null check (total_paise >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  razorpay_order_id text unique,
  razorpay_payment_id text,
  paid_at timestamptz,
  utm jsonb,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders on delete cascade,
  ticket_type_id uuid not null references public.ticket_types,
  qty int not null check (qty > 0),
  unit_price_paise int not null check (unit_price_paise >= 0),
  gst_rate numeric(5,2) not null
);

create table public.holds (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders on delete cascade,
  ticket_type_id uuid not null references public.ticket_types,
  qty int not null check (qty > 0),
  expires_at timestamptz not null,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders,
  ticket_type_id uuid not null references public.ticket_types,
  event_id uuid not null references public.events,
  attendee_name text not null,
  attendee_email text not null,
  attendee_phone text not null,
  qr_token text not null unique default public.gen_token(),
  status text not null default 'valid' check (status in ('valid', 'void', 'checked_in')),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  event_id uuid not null references public.events,
  ticket_id uuid references public.tickets,
  token_scanned text not null,
  staff_id uuid references auth.users,
  result text not null check (result in ('ok', 'already_used', 'wrong_event', 'void', 'not_found')),
  scanned_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders,
  amount_paise int not null check (amount_paise >= 0),
  reason text,
  initiated_by uuid references auth.users,
  razorpay_refund_id text,
  status text not null check (status in ('manual', 'processed')),
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  type text,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  order_id uuid not null references public.orders,
  channel text not null default 'email' check (channel in ('email')),
  template text not null check (template in ('tickets', 'refund', 'late_refund')),
  recipient text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  claimed_at timestamptz,
  provider_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.export_logs (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers,
  event_id uuid references public.events,
  user_id uuid not null references auth.users,
  kind text not null,
  row_count int not null,
  created_at timestamptz not null default now()
);

create index on public.orders (event_id, created_at desc);
create index on public.orders (status, created_at);
create index on public.order_items (order_id);
create index on public.holds (order_id);
create index on public.holds (expires_at) where released_at is null;
create index on public.tickets (order_id);
create index on public.tickets (event_id);
create index on public.checkins (event_id, scanned_at desc);
create index on public.notifications (status, created_at);
create index on public.ticket_types (event_id);

insert into storage.buckets (id, name, public) values ('posters', 'posters', true) on conflict (id) do nothing;
