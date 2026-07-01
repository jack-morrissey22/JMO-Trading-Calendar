-- Custom sounds on a recurring series. Same shape as the per-event columns
-- (0003): sound_data holds the clip as an inline base64 data URI, sound_name is
-- the filename / "has a custom sound" flag. When a series carries a sound, every
-- projected occurrence inherits it so the clip plays on each reminder instead of
-- text-to-speech of the name. (Existing row-level security on series covers these.)
alter table public.series add column if not exists sound_data text;
alter table public.series add column if not exists sound_name text;
