-- School class codes are school-configurable (for example G7-B), while
-- public.users.batch is a legacy placement mirror still used by older views.
-- Keep the legacy A/B/C format for individual users, but allow a bounded,
-- non-blank school class code whenever the user belongs to a school.
alter table public.users
  drop constraint if exists users_batch_check;

alter table public.users
  add constraint users_batch_check
  check (
    batch is null
    or batch = 'N/A'
    or (
      school_id is null
      and batch ~ '^((6|7|8|9|10|11|12)[ABC])$'
    )
    or (
      school_id is not null
      and length(trim(batch)) between 1 and 64
      and batch = trim(batch)
    )
  ) not valid;

alter table public.users
  validate constraint users_batch_check;

comment on column public.users.batch is
  'Legacy class-placement mirror. Individual users use canonical 6A-12C/N/A values; school users may mirror the school-configured classes.class_code.';

notify pgrst, 'reload schema';
