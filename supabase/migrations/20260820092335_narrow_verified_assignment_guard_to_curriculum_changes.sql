create or replace function private.academic_enrich_assignment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_at timestamptz := coalesce(new.assigned_at, new.created_at, now());
  v_class public.classes%rowtype;
  v_should_refresh boolean := (tg_op = 'INSERT');
begin
  if tg_op = 'UPDATE' then
    v_should_refresh :=
      new.school_id is distinct from old.school_id
      or new.subject_name is distinct from old.subject_name
      or new.subject is distinct from old.subject
      or new.subject_id is distinct from old.subject_id
      or new.assigned_at is distinct from old.assigned_at
      or new.class_id is distinct from old.class_id
      or (
        coalesce(old.publish_status, 'published') = 'draft'
        and coalesce(new.publish_status, 'published') <> 'draft'
      );

    if not v_should_refresh then
      return new;
    end if;
  end if;

  new.academic_subject_id := public.academic_resolve_subject_id(
    coalesce(nullif(trim(new.subject_name), ''), nullif(trim(new.subject), ''), nullif(trim(new.subject_id), '')),
    new.school_id
  );
  new.academic_year_id := public.academic_resolve_year_id(new.school_id, v_at);
  new.academic_term_id := public.academic_resolve_term_id(new.academic_year_id, v_at);

  if new.class_id is not null then
    select * into v_class
    from public.classes c
    where c.id = new.class_id
      and (new.school_id is null or c.school_id = new.school_id);
    if found then
      new.grade_level_snapshot := v_class.grade_level;
      new.class_code_snapshot := v_class.class_code;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.academic_enrich_assignment() from public, anon, authenticated;

create or replace function private.trg_assert_assignment_verified_question_scope_coverage()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_assignment_id uuid;
  v_requires_validation boolean := true;
begin
  if tg_table_name = 'assignment_questions' then
    v_assignment_id := coalesce(new.assignment_id, old.assignment_id);
  else
    v_assignment_id := coalesce(new.id, old.id);

    if tg_op = 'UPDATE' then
      if coalesce(new.publish_status, 'published') = 'draft' then
        return new;
      end if;

      v_requires_validation :=
        coalesce(old.publish_status, 'published') is distinct from coalesce(new.publish_status, 'published')
        or new.school_id is distinct from old.school_id
        or new.academic_year_id is distinct from old.academic_year_id
        or new.academic_subject_id is distinct from old.academic_subject_id
        or new.grade_level_snapshot is distinct from old.grade_level_snapshot
        or new.class_id is distinct from old.class_id
        or new.class_code_snapshot is distinct from old.class_code_snapshot
        or new.batch is distinct from old.batch
        or new.assignment_mode is distinct from old.assignment_mode
        or new.subject_id is distinct from old.subject_id
        or new.subject_name is distinct from old.subject_name
        or new.subject is distinct from old.subject;

      if not v_requires_validation then
        return new;
      end if;
    end if;
  end if;

  perform private.assert_assignment_verified_question_scope_coverage(v_assignment_id);
  return coalesce(new, old);
end;
$$;

revoke all on function private.trg_assert_assignment_verified_question_scope_coverage() from public, anon, authenticated;

create or replace function private.trg_assert_assignment_verified_question_audience_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_assignment_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.assignment_id is not distinct from old.assignment_id
       and new.student_id is not distinct from old.student_id
       and new.batch is not distinct from old.batch then
      return new;
    end if;
  end if;

  v_assignment_id := coalesce(new.assignment_id, old.assignment_id);
  perform private.assert_assignment_verified_question_scope_coverage(v_assignment_id);
  return coalesce(new, old);
end;
$$;

revoke all on function private.trg_assert_assignment_verified_question_audience_change() from public, anon, authenticated;

drop trigger if exists trg_student_assignment_verified_scope_guard on public.student_assignments;
create constraint trigger trg_student_assignment_verified_scope_guard
after insert or update or delete on public.student_assignments
deferrable initially deferred
for each row execute function private.trg_assert_assignment_verified_question_audience_change();
