-- Preserve the assignment's option ordering contract on screen and paper.
-- Existing snapshots remain immutable; legacy bank display plans still apply.
set lock_timeout='5s';

create or replace function private.balance_assignment_question_options()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb := new.question_snapshot;
  v_options jsonb;
  v_balanced_options jsonb;
  v_option_count integer;
  v_correct text;
  v_match_count integer;
  v_current_index integer;
  v_block integer;
  v_slot integer;
  v_target_index integer;
begin
  if v_snapshot is null
     or lower(coalesce(v_snapshot->>'question_type','')) <> 'multiple_choice' then
    return new;
  end if;

  -- Preserve rare legacy explanations that explicitly name an answer letter.
  if coalesce(v_snapshot->>'explanation','') ~* '\m(option|answer)\s+[A-D]\M' then
    return new;
  end if;

  v_options := v_snapshot->'options';
  if jsonb_typeof(v_options) <> 'array' then return new; end if;

  v_option_count := jsonb_array_length(v_options);
  if v_option_count < 2 or v_option_count > 6 then return new; end if;

  v_correct := trim(coalesce(v_snapshot->>'correct_answer',''));
  if v_correct = '' then return new; end if;

  select count(*)::integer, min((entry.ordinality - 1)::integer)
  into v_match_count, v_current_index
  from jsonb_array_elements_text(v_options) with ordinality entry(value, ordinality)
  where lower(trim(entry.value)) = lower(v_correct);

  if v_match_count <> 1 or v_current_index is null then return new; end if;

  -- Each complete block uses every position exactly once. A partial final block
  -- therefore keeps the full assignment spread at <= 1, and block boundaries
  -- can create at most two identical positions consecutively.
  v_block := (greatest(coalesce(new.order_index,1),1) - 1) / v_option_count;
  v_slot := mod(greatest(coalesce(new.order_index,1),1) - 1, v_option_count);

  select position_index
  into v_target_index
  from generate_series(0, v_option_count - 1) position_index
  order by md5(
    new.assignment_id::text || ':' ||
    v_block::text || ':' ||
    position_index::text
  )
  offset v_slot
  limit 1;

  if v_target_index is null then return new; end if;

  -- Persist the ordering contract even when no swap is needed. Display-only
  -- bank presentation rules must never override this assignment's saved form.
  v_snapshot := jsonb_set(v_snapshot,'{option_order_policy}','"assignment-balanced-v1"'::jsonb,true);
  new.question_snapshot := v_snapshot;
  if v_target_index = v_current_index then return new; end if;

  select jsonb_agg(
    case
      when index_value = v_current_index then v_options->v_target_index
      when index_value = v_target_index then v_options->v_current_index
      else v_options->index_value
    end
    order by index_value
  )
  into v_balanced_options
  from generate_series(0, v_option_count - 1) index_value;

  new.question_snapshot := jsonb_set(v_snapshot,'{options}',v_balanced_options,false);
  return new;
end;
$$;

revoke all on function private.balance_assignment_question_options()
from public,anon,authenticated,service_role;

drop trigger if exists trg_zzz_assignment_question_option_balance
  on public.assignment_questions;
create trigger trg_zzz_assignment_question_option_balance
before insert on public.assignment_questions
for each row execute function private.balance_assignment_question_options();

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_teacher_assignment_print_packet(p_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid:=auth.uid();
  v_assignment record;
  v_canonical_id uuid;
begin
  if v_actor is null then
    raise exception using errcode='42501',message='Authentication required';
  end if;
  v_canonical_id:=private.assignment_logical_canonical_id(p_assignment_id);

  select
    a.id,a.title,coalesce(lg.display_subject_name,a.subject_name) subject_name,a.topic_name,
    a.description,a.instructions,a.assigned_at,a.due_at,
    coalesce(lg.display_group_name,a.subject_group_name_snapshot,a.class_code_snapshot,a.batch) class_name,
    ay.name academic_year,term.name term_name
  into v_assignment
  from public.assignments a
  join public.teachers t on t.id=a.teacher_id and t.user_id=v_actor
  left join private.assignment_logical_groups lg on lg.canonical_assignment_id=a.id
  left join public.school_academic_years ay on ay.id=a.academic_year_id
  left join public.school_academic_terms term on term.id=a.academic_term_id
  where a.id=v_canonical_id;
  if not found then raise exception using errcode='42501',message='NOT_AUTHORIZED'; end if;

  return jsonb_build_object(
    'assignment',jsonb_build_object(
      'id',v_assignment.id,'title',coalesce(nullif(trim(v_assignment.title),''),v_assignment.topic_name),
      'subjectName',v_assignment.subject_name,'topicName',v_assignment.topic_name,
      'description',v_assignment.description,'instructions',v_assignment.instructions,
      'assignedAt',v_assignment.assigned_at,'dueAt',v_assignment.due_at,'className',v_assignment.class_name,
      'academicYear',v_assignment.academic_year,'term',v_assignment.term_name
    ),
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'questionId',aq.question_id,'orderIndex',aq.order_index,
        'questionText',aq.question_snapshot->>'question_text',
        'questionType',coalesce(aq.question_snapshot->>'question_type','multiple_choice'),
        'optionOrderPolicy',aq.question_snapshot->>'option_order_policy',
        'options',coalesce((
          select jsonb_agg(
            case when jsonb_typeof(option_value)='string'
              then jsonb_build_object('text',(option_value#>>'{}'),'imageUrl',null)
              when jsonb_typeof(option_value)='object'
              then jsonb_build_object('text',coalesce(option_value->>'text',''),'imageUrl',option_value->>'image_url')
              else jsonb_build_object('text',option_value::text,'imageUrl',null) end
          )
          from jsonb_array_elements(
            case when jsonb_typeof(aq.question_snapshot->'options')='array'
              then aq.question_snapshot->'options' else '[]'::jsonb end
          ) option_value
        ),'[]'::jsonb),
        'imageUrl',aq.question_snapshot->>'image_url',
        'imageAltText',aq.question_snapshot->>'image_alt_text',
        'timeLimit',case when coalesce(aq.question_snapshot->>'time_limit','')~'^[0-9]+$'
          then (aq.question_snapshot->>'time_limit')::integer else null end,
        'points',case when coalesce(aq.question_snapshot->>'points','')~'^[0-9]+$'
          then (aq.question_snapshot->>'points')::integer else null end
      ) order by aq.order_index)
      from public.assignment_questions aq where aq.assignment_id=v_canonical_id
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.rpc_teacher_assignment_print_packet(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_teacher_assignment_print_packet(uuid) to authenticated,service_role;
reset lock_timeout;
