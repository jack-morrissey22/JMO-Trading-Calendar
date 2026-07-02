-- Phase 4: Web Push notifications to installed devices (phones, desktops).
--
-- Per-reminder push opt-in, independent of the existing email flag: a reminder
-- can be email-only, push-only, both, or neither.
alter table public.reminders add column if not exists push boolean not null default false;

-- One row per subscribed browser/device (a user can have several). The reminder
-- cron reads these with the service role and POSTs an encrypted push to each
-- endpoint. Endpoint is unique so re-subscribing the same device upserts.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,      -- client public key (for payload encryption)
  auth text not null,        -- client auth secret
  ua text,                   -- user-agent string, so the user can tell devices apart
  created_at timestamptz not null default now()
);

create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
create policy "own push subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
