-- Cover the school foreign key used by formal Writing Hub evidence retention.

create index if not exists idx_bh_writing_voided_attempts_school_created
  on public.bh_writing_voided_attempts (school_id, created_at desc)
  where school_id is not null;
