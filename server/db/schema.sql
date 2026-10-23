-- Opsly365 missed-call product: database setup.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates what is missing.
--
-- Access model: Row Level Security is ON for every table and there are NO policies,
-- so the public (anon) and logged-in (authenticated) roles can read nothing.
-- Only the server, using the secret service key, can read and write.

-- ---------------------------------------------------------------- clients
create table if not exists clients (
  id                   uuid primary key default gen_random_uuid(),
  license_key          text not null unique,
  shop_name            text not null,
  plan                 text not null default 'basic',
  plan_status          text not null default 'active'
                         check (plan_status in ('active', 'grace', 'suspended')),
  paid_until           date,
  chat_cap             int  not null default 300,
  chats_this_month     int  not null default 0,
  month_start          date not null default (date_trunc('month', now())::date),
  shop_info            text not null default '',
  fallback_message     text not null default 'Thanks for your message. Our team will get back to you shortly.',
  answered_template    text not null default '',
  missed_template      text not null default '',
  hold_seconds         int  not null default 30,
  expire_after_hours   int  not null default 3,
  unknown_message_mode text not null default 'always'
                         check (unknown_message_mode in ('always', 'business_hours', 'never')),
  save_contacts        boolean not null default true,
  offers_group_link    text,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------- numbers
create table if not exists numbers (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  number           text not null,
  name             text,
  status           text not null default 'customer' check (status in ('customer', 'ignored')),
  source           text not null default 'call'
                     check (source in ('call', 'first_message', 'upload', 'owner')),
  offers_opt_in    text not null default 'unknown' check (offers_opt_in in ('yes', 'no', 'unknown')),
  in_offers_group  boolean not null default false,
  bot_paused_until timestamptz,
  first_seen       timestamptz not null default now(),
  unique (client_id, number)
);

-- ---------------------------------------------------------------- calls
create table if not exists calls (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  number       text not null,
  contact_name text,
  type         text not null check (type in ('answered', 'missed')),
  duration     int  not null default 0,
  called_at    timestamptz not null default now()
);
create index if not exists calls_client_time on calls (client_id, called_at desc);

-- ---------------------------------------------------------------- messages
create table if not exists messages (
  id         bigint generated always as identity primary key,
  client_id  uuid not null references clients(id) on delete cascade,
  number     text not null,
  direction  text not null check (direction in ('out', 'in')),
  body       text not null,
  source     text not null check (source in ('template', 'bot', 'owner', 'customer')),
  sent_at    timestamptz not null default now()
);
create index if not exists messages_chat on messages (client_id, number, sent_at desc);

-- ---------------------------------------------------------------- outbox
create table if not exists outbox (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  number      text not null,
  body        text not null,
  type        text not null check (type in ('call_message', 'bot_reply', 'group_add', 'group_invite')),
  status      text not null default 'queued'
                check (status in ('queued', 'sent', 'failed', 'cancelled', 'expired')),
  send_after  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists outbox_ready on outbox (client_id, status, send_after);

-- ---------------------------------------------------------------- devices
create table if not exists devices (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  kind             text not null check (kind in ('android', 'desktop')),
  last_seen        timestamptz,
  whatsapp_linked  boolean not null default false
);

-- ---------------------------------------------------------------- payments
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  amount        numeric(10, 2) not null,
  currency      text not null default 'AED',
  period_start  date,
  period_end    date,
  method        text not null default 'manual' check (method in ('manual', 'card', 'bank')),
  reference     text,
  paid_at       timestamptz not null default now()
);

-- ------------------------------------------- monthly chat counter (atomic)
-- Adds one to the client's chat count and starts again from 1 in a new month.
create or replace function increment_chat(p_client uuid)
returns int
language plpgsql
as $$
declare
  c int;
begin
  update clients
     set chats_this_month = case
           when month_start < date_trunc('month', now())::date then 1
           else chats_this_month + 1
         end,
         month_start = date_trunc('month', now())::date
   where id = p_client
   returning chats_this_month into c;
  return c;
end;
$$;

-- ---------------------------------------------------------------- locking
alter table clients  enable row level security;
alter table numbers  enable row level security;
alter table calls    enable row level security;
alter table messages enable row level security;
alter table outbox   enable row level security;
alter table devices  enable row level security;
alter table payments enable row level security;

-- Nobody but the server's service role gets any access.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on function increment_chat(uuid) from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function increment_chat(uuid) to service_role;

-- ------------------------------------------------- sample data (TEST ONLY)
-- Three test clients that match the test script. Delete them before real clients go live:
--   delete from clients where license_key like 'TEST-%';
insert into clients (license_key, shop_name, plan_status, chat_cap, fallback_message, shop_info)
values
  ('TEST-ACTIVE', 'Sample Mobile Shop', 'active', 300,
   'Thanks for your message. Our team will get back to you shortly.',
   E'SAMPLE DATA - replace with the real shop''s details.\nShop: Sample Mobile Shop, mobile sales and repair.\nLocation: Sample Mall, ground floor, Dubai (placeholder).\nHours: Every day 10:00 to 22:00. Friday 14:00 to 22:00.\nServices and prices (AED, from): screen replacement 150, battery replacement 90, charging port repair 70, software update or unlock 50, screen protector fitting 20.\nRepair time: most repairs 30 to 60 minutes, screen replacement same day.\nWarranty: 3 months on repairs.\nPayment: cash, card, Apple Pay.\nPhone for the team: 04 000 0000 (placeholder).\nNew phones: the team can check stock and prices on request.'),
  ('TEST-SUSPENDED', 'Unpaid Shop', 'suspended', 300, '', 'Not used.'),
  ('TEST-CAPPED', 'Capped Shop', 'active', 1,
   'Thanks for your message. Our team will reply during working hours.',
   'Capped Shop, open 9 to 6 daily. Used to test the monthly chat cap.')
on conflict (license_key) do nothing;

insert into numbers (client_id, number, status, source)
select id, '971500000001', 'ignored', 'upload' from clients where license_key = 'TEST-ACTIVE'
on conflict (client_id, number) do nothing;
