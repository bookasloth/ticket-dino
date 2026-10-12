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
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Chhayatai Nikhare Sabhagruh', 'chhayatai-nikhare-sabhagruh', 'Chhayatai Nikhare Sabhagruh');

insert into organizer_members (organizer_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'staff');

insert into venues (id, organizer_id, name, address, city, maps_url)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Chhayatai Nikhare Sabhagruh', 'Main Auditorium', 'Nagpur',
        'https://www.google.com/maps/search/?api=1&query=Chhayatai+Nikhare+Sabhagruh');

-- Demo programme: 10 events. The first keeps the fixed id the e2e test uses.

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'swar-sandhya-2026', 'Swar Sandhya: Marathi Bhavgeet Evening', 'Music', 'An evening of timeless Marathi bhavgeet and natya sangeet, performed live with harmonium, tabla and violin.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '3 days') + interval '18 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '3 days') + interval '21 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'General Admission', 29900, 18, 300, 69, 10, now() + interval '2 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Balcony', 19900, 18, 150, 60, 10, now() + interval '2 days', 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Front Rows', 59900, 18, 60, 34, 10, now() + interval '2 days', 3);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'natak-sahi-re-sahi', 'Sahi Re Sahi: Marathi Comedy Natak', 'Theatre', 'The evergreen comedy of mistaken identities returns to the stage. Two hours of non-stop laughter for the whole family.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '6 days') + interval '19 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '6 days') + interval '22 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000001', 'General Admission', 39900, 18, 350, 112, 10, now() + interval '5 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000001', 'Premium', 69900, 18, 80, 39, 10, now() + interval '5 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hasya-kallol-standup', 'Hasya Kallol: Stand-up Night', 'Comedy', 'Four of Maharashtra''s sharpest stand-up comics, one stage. Marathi and Hindi sets. Ages 16+.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '9 days') + interval '20 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '9 days') + interval '23 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000002', 'General Admission', 49900, 18, 300, 123, 10, now() + interval '8 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000002', 'Front Rows', 89900, 18, 50, 29, 10, now() + interval '8 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'kathak-utsav-2026', 'Kathak Utsav', 'Dance', 'A classical Kathak showcase by senior disciples, with live music. Celebrating rhythm, abhinaya and storytelling.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '12 days') + interval '18 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '12 days') + interval '21 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000003', 'General Admission', 24900, 18, 300, 150, 10, now() + interval '11 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000003', 'Student', 9900, 18, 100, 67, 10, now() + interval '11 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'diwali-pahat-2026', 'Diwali Pahat: Dawn Music Concert', 'Music', 'Begin Diwali the traditional way: a sunrise concert of devotional and classical music, with faral served after.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '15 days') + interval '6 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '15 days') + interval '9 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000004', 'General Admission', 34900, 18, 350, 206, 10, now() + interval '14 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000004', 'Family Pass (4)', 119900, 18, 40, 30, 10, now() + interval '14 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bal-natya-jungle-book', 'Jungle Book: Children''s Natak', 'Kids', 'A colourful musical play for kids aged 4 to 12, with puppets, songs and audience fun.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '18 days') + interval '11 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '18 days') + interval '14 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000005', 'Child', 14900, 18, 250, 170, 10, now() + interval '17 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000005', 'Adult', 19900, 18, 200, 170, 10, now() + interval '17 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lavani-mahotsav', 'Lavani Mahotsav', 'Folk', 'The energy of traditional Lavani and Tamasha, performed by award-winning troupes from across Maharashtra.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '21 days') + interval '19 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '21 days') + interval '22 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000006', 'General Admission', 44900, 18, 300, 231, 10, now() + interval '20 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000006', 'Premium', 79900, 18, 80, 3, 10, now() + interval '20 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ghazal-ki-shaam', 'Ghazal Ki Shaam', 'Music', 'An intimate night of classic ghazals by Mehdi Hassan, Jagjit Singh and Ghulam Ali, live with sarangi and tabla.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '24 days') + interval '19 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '24 days') + interval '22 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000007', 'General Admission', 39900, 18, 300, 258, 10, now() + interval '23 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000007', 'Front Rows', 74900, 18, 50, 6, 10, now() + interval '23 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'yuva-sanvad-2026', 'Yuva Sanvad: Career & Startup Talks', 'Talks', 'Talks and Q&A with founders, IAS officers and creators on careers, startups and public service. Ideal for students.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '27 days') + interval '10 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '27 days') + interval '13 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000008', 'Student', 0, 0, 300, 15, 10, now() + interval '26 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000008', 'General', 9900, 18, 150, 33, 10, now() + interval '26 days', 2);

insert into events (id, organizer_id, slug, title, category, description, faqs, starts_at, ends_at, venue_id, status,
                    fee_bps, fee_flat_paise, fee_gst_rate, refund_policy)
values ('cccccccc-cccc-cccc-cccc-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'natsamrat-classic', 'Natsamrat: Classic Revival', 'Theatre', 'Kusumagraj''s masterpiece, staged in full. A moving story of an ageing actor, his art and his family.', '[{"q":"Is there parking?","a":"Yes, free two-wheeler and car parking inside the campus."},{"q":"When do doors open?","a":"30 minutes before the show. Latecomers are seated during the interval."},{"q":"Is the hall air-conditioned?","a":"Yes, fully air-conditioned, with wheelchair access at the main entrance."}]',
        date_trunc('day', now() + interval '30 days') + interval '18 hours' - interval '5 hours 30 minutes',
        date_trunc('day', now() + interval '30 days') + interval '21 hours' - interval '5 hours 30 minutes',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', 200, 1000, 18, 'Refunds up to 3 days before the show, minus the booking fee.');

insert into ticket_types (organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000009', 'General Admission', 49900, 18, 350, 49, 10, now() + interval '29 days', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000009', 'Premium', 89900, 18, 80, 24, 10, now() + interval '29 days', 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-000000000009', 'Balcony', 29900, 18, 150, 72, 10, now() + interval '29 days', 3);

insert into event_staff (organizer_id, event_id, user_id)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', id, '22222222-2222-2222-2222-222222222222' from events;


-- Pro demo: group discount, an early-bird price step, add-ons and coupons.
update ticket_types set group_min_qty = 6, group_pct = 10 where name = 'General Admission';

insert into ticket_types (id, organizer_id, event_id, name, price_paise, gst_rate, capacity, sold_count, max_per_order, sale_ends_at, sort)
select 'dddddddd-dddd-dddd-dddd-dddddddddddd', organizer_id, event_id, 'Early Bird', 29900, 18, 100, 72, 10, sale_ends_at, 0
from ticket_types where event_id = 'cccccccc-cccc-cccc-cccc-000000000001' and name = 'General Admission';
update ticket_types set unlocks_after_ticket_type_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
where event_id = 'cccccccc-cccc-cccc-cccc-000000000001' and name = 'General Admission';

insert into addons (organizer_id, event_id, name, price_paise, gst_rate, capacity, max_per_order, sort)
select organizer_id, id, a.name, a.price, 18, a.cap, 4, a.sort from events
cross join (values ('Car parking pass', 5000, 100, 1), ('Snack combo (samosa + chai)', 14900, 200, 2),
                   ('Souvenir programme booklet', 9900, 150, 3)) a(name, price, cap, sort);

insert into coupons (organizer_id, event_id, code, kind, value, max_discount_paise, max_uses)
select organizer_id, id, 'DIWALI20', 'percent', 20, 20000, 200 from events;
insert into coupons (organizer_id, event_id, code, kind, value, max_uses, valid_until)
select organizer_id, id, 'FIRST100', 'flat', 10000, 50, now() + interval '20 days' from events;

-- Job secrets read by pg_cron (Task 13). Local values only.
select vault.create_secret('http://host.docker.internal:3000', 'app_url');
select vault.create_secret('local-cron-secret', 'cron_secret');
