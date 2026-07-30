-- Per-event / per-series market timezone. NULL = "use the app's home timezone"
-- (Europe/Dublin), so every existing row keeps its current behaviour untouched.
-- A US release would be set to 'America/New_York' etc. so its instant is computed
-- from the US wall-clock and stays correct across both zones' DST changes.
alter table public.events add column if not exists tz text;
alter table public.series add column if not exists tz text;
