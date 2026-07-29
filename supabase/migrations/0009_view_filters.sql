-- Per-user view filters (which priorities / categories to hide in Month & Week).
-- Stored as exclusions so newly-added categories show by default:
--   { "hidden_priority_ids": ["<tier id>", ...], "hidden_categories": ["Earnings", "", ...] }
-- ("" in hidden_categories hides uncategorised events). Synced across devices.
alter table public.profiles
  add column if not exists view_filters jsonb not null default '{}'::jsonb;
