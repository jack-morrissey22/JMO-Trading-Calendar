-- Optional series-wide note. When set, projectSeries stamps it onto every new
-- occurrence, so a note you want to reuse each cycle (e.g. which exchanges are
-- open/closed on a holiday) shows up on future occurrences automatically without
-- retyping. Per-occurrence notes still work; this is only populated when the user
-- ticks "apply this note to later occurrences".
alter table public.series add column if not exists notes text;
