-- Liveness heartbeat for the reminder sender (Cloudflare Worker cron). The worker
-- (service role) stamps last_run_at on every minute run; the app reads it to show
-- an in-app health indicator so a silently-dead sender is visible. Single global row.
create table if not exists public.service_health (
  id          int primary key default 1,
  last_run_at timestamptz,
  constraint service_health_singleton check (id = 1)
);

insert into public.service_health (id, last_run_at)
  values (1, now())
  on conflict (id) do nothing;

alter table public.service_health enable row level security;

-- Any signed-in user may read it; only the worker's service-role key writes
-- (service role bypasses RLS, so no insert/update policy is needed).
drop policy if exists "read service health" on public.service_health;
create policy "read service health" on public.service_health
  for select to authenticated using (true);
