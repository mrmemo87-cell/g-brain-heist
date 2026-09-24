create or replace function private.enforce_school_english_taxonomy_registry()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_question record;
  v_phase text;
  v_primary_name text;
  v_subskill_name text;
begin
  select
    q.pool_scope,
    q.content_origin,
    q.grade_level,
    q.eligible_grade_levels,
    s.code as subject_code,
    s.name as subject_name
  into v_question
  from public.questions q
  left join public.academic_subjects s on s.id=q.academic_subject_id
  where q.id=new.question_id;

  if not found then return new; end if;

  if v_question.pool_scope <> 'school'
     or v_question.content_origin <> 'teacher'
     or not (
       lower(trim(coalesce(v_question.subject_code,'')))='english'
       or lower(trim(coalesce(v_question.subject_name,'')))='english'
     ) then
    return new;
  end if;

  v_phase:=case
    when coalesce(nullif(regexp_replace(coalesce(v_question.grade_level,''),'\D','','g'),''),'0')::integer between 1 and 6 then 'primary'
    when coalesce(nullif(regexp_replace(coalesce(v_question.grade_level,''),'\D','','g'),''),'0')::integer between 7 and 9 then 'lower_secondary'
    else 'upper_secondary'
  end;

  select skill.name, leaf.name
  into v_primary_name, v_subskill_name
  from public.academic_skill_registry_versions version
  join public.academic_skill_registry_nodes skill
    on skill.registry_version_id=version.id
   and skill.code=new.primary_skill_code
   and skill.node_type='skill'
   and skill.status='active'
  join public.academic_skill_registry_nodes leaf
    on leaf.registry_version_id=version.id
   and leaf.parent_id=skill.id
   and leaf.code=new.atomic_subskill_code
   and leaf.node_type='subskill'
   and leaf.status='active'
  where version.code='bh-english-core-v1'
    and version.status='published'
    and v_phase=any(skill.applicable_phases)
    and v_phase=any(leaf.applicable_phases)
  limit 1;

  if not found then
    raise exception using errcode='23514',
      message='school_english_taxonomy_registry_match_required';
  end if;

  if lower(trim(new.primary_skill_name)) <> lower(trim(v_primary_name))
     or lower(trim(new.atomic_subskill_name)) <> lower(trim(v_subskill_name)) then
    raise exception using errcode='23514',
      message='school_english_taxonomy_registry_name_code_mismatch';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_school_english_taxonomy_registry()
from public,anon,authenticated,service_role;

drop trigger if exists trg_enforce_school_english_taxonomy_registry
on public.verified_question_diagnostic_taxonomy;

create trigger trg_enforce_school_english_taxonomy_registry
before insert or update of
  primary_skill_code,primary_skill_name,atomic_subskill_code,atomic_subskill_name,
  question_id,review_status
on public.verified_question_diagnostic_taxonomy
for each row
when (new.review_status='approved')
execute function private.enforce_school_english_taxonomy_registry();

do $migration$
declare
  v_oid oid;
  v_def text;
  v_old text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='rpc_superadmin_govern_school_question'
    and pg_get_function_identity_arguments(p.oid)='p_question_id uuid, p_action text, p_payload jsonb';

  if v_oid is null then
    raise exception 'rpc_superadmin_govern_school_question signature not found';
  end if;

  select pg_get_functiondef(v_oid) into v_def;

  v_old := $old$
  v_primary_skill_code := nullif(trim(v_payload ->> 'primarySkillCode'), '');
  if v_primary_skill_code is null then
    v_primary_skill_code := v_subject_code || '.' || trim(both '-' from regexp_replace(
      lower(v_primary_skill_name), '[^a-z0-9]+', '-', 'g'
    ));
  end if;
  v_atomic_subskill_code := nullif(trim(v_payload ->> 'atomicSubskillCode'), '');
  if v_atomic_subskill_code is null then
    v_atomic_subskill_code := v_primary_skill_code || '.' || trim(both '-' from regexp_replace(
      lower(v_atomic_subskill_name), '[^a-z0-9]+', '-', 'g'
    ));
  end if;
$old$;

  v_new := $new$
  v_primary_skill_code := coalesce(
    nullif(trim(v_payload ->> 'primarySkillCode'), ''),
    nullif(trim(v_submission.taxonomy_proposal ->> 'primary_skill_code'), '')
  );
  if v_primary_skill_code is null then
    v_primary_skill_code := v_subject_code || '.' || trim(both '-' from regexp_replace(
      lower(v_primary_skill_name), '[^a-z0-9]+', '-', 'g'
    ));
  end if;
  v_atomic_subskill_code := coalesce(
    nullif(trim(v_payload ->> 'atomicSubskillCode'), ''),
    nullif(trim(v_submission.taxonomy_proposal ->> 'atomic_subskill_code'), '')
  );
  if v_atomic_subskill_code is null then
    v_atomic_subskill_code := v_primary_skill_code || '.' || trim(both '-' from regexp_replace(
      lower(v_atomic_subskill_name), '[^a-z0-9]+', '-', 'g'
    ));
  end if;

  if lower(trim(coalesce(v_authority.academic_subject_code, ''))) = 'english'
     or lower(trim(coalesce(v_authority.academic_subject_name, ''))) = 'english' then
    select skill.name, leaf.name
    into v_primary_skill_name, v_atomic_subskill_name
    from public.academic_skill_registry_versions registry
    join public.academic_skill_registry_nodes skill
      on skill.registry_version_id=registry.id
     and skill.code=v_primary_skill_code
     and skill.node_type='skill'
     and skill.status='active'
    join public.academic_skill_registry_nodes leaf
      on leaf.registry_version_id=registry.id
     and leaf.parent_id=skill.id
     and leaf.code=v_atomic_subskill_code
     and leaf.node_type='subskill'
     and leaf.status='active'
    where registry.code='bh-english-core-v1'
      and registry.status='published'
      and (
        case
          when v_authority.grade_level::integer between 1 and 6 then 'primary'
          when v_authority.grade_level::integer between 7 and 9 then 'lower_secondary'
          else 'upper_secondary'
        end
      )=any(skill.applicable_phases)
      and (
        case
          when v_authority.grade_level::integer between 1 and 6 then 'primary'
          when v_authority.grade_level::integer between 7 and 9 then 'lower_secondary'
          else 'upper_secondary'
        end
      )=any(leaf.applicable_phases)
    limit 1;

    if not found then
      raise exception using errcode='23514',
        message='school_question_english_registry_match_required';
    end if;
  end if;
$new$;

  if position(v_old in v_def)=0 then
    raise exception 'Expected school governance skill-code block not found';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end;
$migration$;

revoke all on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb)
to authenticated,service_role;

comment on function private.enforce_school_english_taxonomy_registry() is
  'Fail-closed canonical taxonomy guard for future School Verified teacher-authored English evidence.';
comment on function public.rpc_superadmin_govern_school_question(uuid,text,jsonb) is
  'Atomic school-pool governance. English approvals must use the published Brain Heist canonical skill registry; stored batch codes may supply the governed selection.';
