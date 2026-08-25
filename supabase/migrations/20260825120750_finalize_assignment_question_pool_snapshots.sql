-- The snapshot backfill in the preceding migration fires assignment audit
-- triggers. Finalize the constraint in a separate transaction after those
-- trigger events have committed.

alter table public.assignment_questions
  alter column pool_scope_snapshot set not null,
  drop constraint if exists assignment_questions_owner_school_id_snapshot_fkey,
  drop constraint if exists assignment_questions_snapshot_authority_check;

alter table public.assignment_questions
  add constraint assignment_questions_owner_school_id_snapshot_fkey
    foreign key (owner_school_id_snapshot)
    references public.schools(id) on delete restrict,
  add constraint assignment_questions_snapshot_authority_check check (
    content_origin_snapshot in ('brain_heist', 'teacher')
    and pool_scope_snapshot in ('global', 'school', 'teacher')
    and verification_status_snapshot in (
      'unverified', 'in_review', 'verified', 'retired', 'rejected'
    )
    and question_content_hash ~ '^[0-9a-f]{64}$'
    and (
      (pool_scope_snapshot = 'global'
        and content_origin_snapshot = 'brain_heist'
        and owner_school_id_snapshot is null)
      or (pool_scope_snapshot = 'school'
        and content_origin_snapshot = 'teacher'
        and owner_school_id_snapshot is not null)
      or (pool_scope_snapshot = 'teacher'
        and content_origin_snapshot = 'teacher'
        and owner_school_id_snapshot is null)
    )
    and (
      not analytics_eligible_snapshot
      or (
        pool_scope_snapshot in ('global', 'school')
        and verification_status_snapshot = 'verified'
      )
    )
  );

create index if not exists assignment_questions_owner_school_snapshot_idx
  on public.assignment_questions(owner_school_id_snapshot, question_id)
  where owner_school_id_snapshot is not null;
