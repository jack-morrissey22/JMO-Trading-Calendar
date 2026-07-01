-- Custom per-event reminder sounds. Short clips are stored inline as a base64
-- data URI (sound_data); sound_name holds the original filename for display and
-- is the lightweight "has a custom sound" flag surfaced in the event list.
-- (Existing row-level security on events already covers these columns.)
alter table public.events add column if not exists sound_data text;
alter table public.events add column if not exists sound_name text;
