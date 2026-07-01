-- Proactive suggestions (Phase 3). A `series` is a repeating event template plus
-- its recurrence rule; it materialises `tentative` event rows forward to a horizon.
-- Events gain series_id + status ('confirmed' | 'tentative' | 'skipped').

create table public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- template (how each generated occurrence looks)
  title text not null,
  time_of_day time,
  all_day boolean not null default false,
  window_days int,                    -- multi-day window length (null = single day)
  priority_tier_id uuid references public.priority_tiers(id) on delete set null,
  category text not null default 'Custom',
  tags text[] not null default '{}',
  speak boolean not null default false,
  reminders jsonb not null default '[]',

  -- recurrence
  rule jsonb not null,                -- { mode:'weekly'|'monthly', ... } (see lib/recurrence.ts)
  horizon_months int not null default 3,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.series(user_id);
alter table public.series enable row level security;
create policy "own series" on public.series
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.events add column if not exists series_id uuid references public.series(id) on delete set null;
alter table public.events add column if not exists status text not null default 'confirmed';
create index if not exists events_series_idx on public.events(series_id);
