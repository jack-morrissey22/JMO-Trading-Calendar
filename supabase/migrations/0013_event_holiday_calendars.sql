-- Which holiday calendar(s) an event / series "respects". For Nth-business-day
-- patterns the count skips those calendars' holidays (and future occurrences are
-- re-projected); for other patterns a landing-on-a-holiday is flagged (Phase 3).
-- Empty {} = respects none (default; nothing changes).
alter table public.events add column if not exists holiday_calendar_ids text[] not null default '{}';
alter table public.series add column if not exists holiday_calendar_ids text[] not null default '{}';
