-- Email reminders (Phase 2). Per-reminder opt-in plus the fields the scheduled
-- sender needs: fire_at (when it is due, UTC, computed by the app) and sent_at
-- (idempotency — a reminder is emailed at most once).
alter table public.reminders add column if not exists email boolean not null default false;
alter table public.reminders add column if not exists fire_at timestamptz;
alter table public.reminders add column if not exists sent_at timestamptz;

-- Fast lookup of due, unsent email reminders for the sender job.
create index if not exists reminders_due_idx
  on public.reminders (fire_at)
  where email and sent_at is null;
