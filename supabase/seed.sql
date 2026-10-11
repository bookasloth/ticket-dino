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
