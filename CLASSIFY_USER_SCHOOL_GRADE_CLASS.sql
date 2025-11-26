-- Ensure the users table captures school, grade, and class selections
-- Run in Supabase SQL editor or psql

-- Add missing columns
alter table public.users add column if not exists school text;
alter table public.users add column if not exists grade smallint;
alter table public.users add column if not exists batch text;

-- Constrain grades to the supported 6-12 range
alter table public.users
  drop constraint if exists users_grade_check;
alter table public.users
  add constraint users_grade_check
  check (grade is null or grade between 6 and 12);

-- Constrain batch to the allowed class formats
alter table public.users
  drop constraint if exists users_batch_check;
alter table public.users
  add constraint users_batch_check
  check (
    batch is null
    or batch = 'N/A'
    or batch ~ '^((6|7|8|9|10|11|12)[ABC])$'
  );

-- Default existing users to the only active school when missing
update public.users
set school = coalesce(school, 'Silk Road International School')
where school is distinct from 'Silk Road International School';

-- Optional: make the defaults explicit for new rows
alter table public.users alter column school set default 'Silk Road International School';
