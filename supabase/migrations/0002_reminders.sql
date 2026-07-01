-- Reminders: stackable, per-event alerts (Phase 1 = in-app; Phase 2 adds email).
-- Two kinds:
--   'relative' -> fire minutes_before the event start (0, 15, 30, 60, ...)
--   'fixed'    -> fire at at_time on (event day - days_before), e.g. morning-of / day-before
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'relative',
  minutes_before int,
  days_before int,
  at_time time,
  channel text not null default 'inapp',
  created_at timestamptz not null default now()
);

create index on public.reminders(event_id);
create index on public.reminders(user_id);

alter table public.reminders enable row level security;

create policy "own reminders" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
