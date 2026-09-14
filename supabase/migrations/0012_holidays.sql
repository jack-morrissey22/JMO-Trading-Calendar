-- Named holiday calendars + their dates. Calendars are user-defined (seed the
-- common markets with one click, or add your own e.g. China). Phase 2 lets an
-- event/series "respect" one or more calendars. All holidays show on the calendar
-- for awareness regardless of whether anything respects them. RLS keyed to the user.
create table if not exists public.holiday_calendars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.holidays (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  calendar_id uuid not null references public.holiday_calendars (id) on delete cascade,
  day         date not null,
  name        text,
  created_at  timestamptz not null default now(),
  unique (calendar_id, day)
);
create index if not exists holidays_user_day_idx on public.holidays (user_id, day);

alter table public.holiday_calendars enable row level security;
alter table public.holidays          enable row level security;

create policy "own holiday_calendars" on public.holiday_calendars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own holidays" on public.holidays
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
