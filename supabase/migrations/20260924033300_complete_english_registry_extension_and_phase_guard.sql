create or replace function private.enforce_school_english_taxonomy_registry()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_question record;
  v_phase text;
  v_max_grade integer;
  v_primary_name text;
  v_subskill_name text;
begin
  select q.pool_scope,q.content_origin,q.grade_level,q.eligible_grade_levels,
         s.code as subject_code,s.name as subject_name
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

  select max(g) into v_max_grade
  from unnest(coalesce(v_question.eligible_grade_levels,'{}'::smallint[])) g;

  if v_max_grade is null then
    v_max_grade:=nullif(substring(coalesce(v_question.grade_level,'') from '[0-9]+'),'')::integer;
  end if;

  v_phase:=case
    when v_max_grade between 1 and 6 then 'primary'
    when v_max_grade between 7 and 9 then 'lower_secondary'
    when v_max_grade between 10 and 12 then 'upper_secondary'
    else 'upper_secondary'
  end;

  select skill.name,leaf.name
  into v_primary_name,v_subskill_name
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
    raise exception using errcode='23514',message='school_english_taxonomy_registry_match_required';
  end if;

  if lower(trim(new.primary_skill_name)) <> lower(trim(v_primary_name))
     or lower(trim(new.atomic_subskill_name)) <> lower(trim(v_subskill_name)) then
    raise exception using errcode='23514',message='school_english_taxonomy_registry_name_code_mismatch';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_school_english_taxonomy_registry()
from public,anon,authenticated,service_role;
