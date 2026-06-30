-- JMO Trading Calendar — base schema (Phase 0)
-- Tables: profiles, priority_tiers, events. RLS keyed to the signed-in user.
-- A signup trigger seeds a profile + default priority tiers automatically.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone    text not null default 'Europe/Dublin',
  created_at  timestamptz not null default now()
);

create table if not exists public.priority_tiers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  color          text not null,
  rank           int  not null,            -- 0 = highest priority
  triggers_email boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  all_day          boolean not null default false,
  priority_tier_id uuid references public.priority_tiers (id) on delete set null,
  category         text not null default 'Custom',
  tags             text[] not null default '{}',
  notes            text,
  extra            jsonb not null default '{}',   -- additive future fields, no migration needed
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists events_user_start_idx on public.events (user_id, starts_at);
create index if not exists tiers_user_rank_idx on public.priority_tiers (user_id, rank);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user can only see/modify their own rows
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.priority_tiers enable row level security;
alter table public.events         enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own tiers" on public.priority_tiers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own events" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- On signup: create a profile row + seed the default priority tiers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );

  insert into public.priority_tiers (user_id, name, color, rank, triggers_email) values
    (new.id, 'Critical', '#ef4444', 0, true),
    (new.id, 'High',     '#f59e0b', 1, true),
    (new.id, 'Medium',   '#3b82f6', 2, false),
    (new.id, 'Low',      '#6b7280', 3, false);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep events.updated_at fresh
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();
