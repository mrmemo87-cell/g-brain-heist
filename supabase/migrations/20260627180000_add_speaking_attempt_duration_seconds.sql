-- Persist IELTS Speaking recording duration using the column expected by the
-- submission UI, review queue RPCs, and AI draft-review flow.
--
-- Production-safe notes:
-- - Do not drop or rename legacy duration columns.
-- - Keep the new column nullable so old rows and partially migrated databases
--   are not blocked.
-- - Backfill from known legacy duration column names when they exist.

alter table if exists public.ielts_speaking_attempts
  add column if not exists duration_seconds integer;

do $$
begin
  if to_regclass('public.ielts_speaking_attempts') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ielts_speaking_attempts'
      and column_name = 'duration'
  ) then
    execute 'update public.ielts_speaking_attempts set duration_seconds = duration where duration_seconds is null and duration is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ielts_speaking_attempts'
      and column_name = 'audio_duration_seconds'
  ) then
    execute 'update public.ielts_speaking_attempts set duration_seconds = audio_duration_seconds where duration_seconds is null and audio_duration_seconds is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ielts_speaking_attempts'
      and column_name = 'recording_duration'
  ) then
    execute 'update public.ielts_speaking_attempts set duration_seconds = recording_duration where duration_seconds is null and recording_duration is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ielts_speaking_attempts'
      and column_name = 'audio_duration'
  ) then
    execute 'update public.ielts_speaking_attempts set duration_seconds = audio_duration where duration_seconds is null and audio_duration is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ielts_speaking_attempts'
      and column_name = 'duration_ms'
  ) then
    execute 'update public.ielts_speaking_attempts set duration_seconds = ceiling(duration_ms::numeric / 1000)::integer where duration_seconds is null and duration_ms is not null';
  end if;
end $$;

alter table if exists public.ielts_speaking_attempts
  drop constraint if exists ielts_speaking_attempts_duration_seconds_nonnegative;

alter table if exists public.ielts_speaking_attempts
  add constraint ielts_speaking_attempts_duration_seconds_nonnegative
  check (duration_seconds is null or duration_seconds >= 0) not valid;


-- Ask PostgREST/Supabase to refresh its schema cache after the migration.
notify pgrst, 'reload schema';
