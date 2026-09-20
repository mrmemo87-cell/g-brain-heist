-- Normalize teacher PDF question topics at batch submission time.
--
-- The PDF extractor intentionally proposes narrow diagnostic taxonomy per question.
-- Those atomic skills must not become one top-level Question Bank topic per item.
-- This compatibility layer keeps teacher-edited topic groupings intact, but when an
-- AI-generated batch is clearly fragmented into near-unique micro-topics it uses a
-- single parent instructional topic derived from the source document title.
-- Detailed primary/atomic skills remain preserved in question tags and batch
-- taxonomy_proposal evidence.

create or replace function public.rpc_teacher_submit_question_batch_v3(
  p_extraction_id uuid,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_batch_id uuid;
  v_effective_questions jsonb := p_questions;
  v_question_count integer := 0;
  v_distinct_topic_count integer := 0;
  v_document_title text;
  v_preferred_topic text;
  v_parent_topic text;
begin
  -- Read only trusted extraction metadata. A preferred topic, when present in a
  -- future/compatible processing request, is authoritative because the teacher
  -- explicitly selected it before generation.
  select
    nullif(btrim(e.processing_request ->> 'preferred_topic'), ''),
    nullif(btrim(e.extraction_payload ->> 'document_title'), '')
  into v_preferred_topic, v_document_title
  from public.teacher_question_pdf_extractions e
  where e.id = p_extraction_id;

  if jsonb_typeof(p_questions) = 'array' then
    select
      count(*)::integer,
      count(distinct lower(btrim(coalesce(item ->> 'topic', ''))))
        filter (where nullif(btrim(coalesce(item ->> 'topic', '')), '') is not null)::integer
    into v_question_count, v_distinct_topic_count
    from jsonb_array_elements(p_questions) item;
  end if;

  if v_preferred_topic is not null then
    v_parent_topic := left(regexp_replace(v_preferred_topic, '\s+', ' ', 'g'), 160);
  elsif v_question_count >= 8
    and v_distinct_topic_count >= 6
    and v_distinct_topic_count >= ceil(v_question_count * 0.60)::integer
  then
    -- A near one-topic-per-question result is diagnostic taxonomy leaking into
    -- navigation. Use the source lesson/unit title as the parent topic instead.
    v_parent_topic := v_document_title;

    if v_parent_topic is not null and strpos(v_parent_topic, ':') > 0 then
      -- Common source titles are "Worksheet/Unit label: Actual topic". Keep the
      -- meaningful suffix rather than file/worksheet furniture.
      v_parent_topic := regexp_replace(v_parent_topic, '^.*:\s*', '');
    end if;

    if v_parent_topic is not null then
      v_parent_topic := btrim(regexp_replace(v_parent_topic, '\s+', ' ', 'g'), ' -–—:;,.');
      v_parent_topic := left(v_parent_topic, 160);

      if length(v_parent_topic) < 3
        or lower(v_parent_topic) in (
          'question paper', 'questions', 'worksheet', 'worksheets',
          'learning material', 'practice', 'revision', 'review'
        )
      then
        v_parent_topic := null;
      end if;
    end if;
  end if;

  if v_parent_topic is not null and jsonb_typeof(p_questions) = 'array' then
    select jsonb_agg(
      case
        when jsonb_typeof(item) = 'object'
          then jsonb_set(item, '{topic}', to_jsonb(v_parent_topic), true)
        else item
      end
      order by ordinality
    )
    into v_effective_questions
    from jsonb_array_elements(p_questions) with ordinality submitted(item, ordinality);
  end if;

  -- V2 remains the source/provenance authority and performs the atomic create.
  v_result := public.rpc_teacher_submit_question_batch_v2(p_extraction_id, v_effective_questions);
  v_batch_id := nullif(v_result ->> 'batchId', '')::uuid;

  if v_batch_id is null then
    raise exception using errcode = '23514', message = 'teacher_question_batch_id_missing';
  end if;

  update public.questions q
  set accepted_answers = case
        when q.question_type = 'short_answer' then coalesce((
          select array_agg(value order by ordinality)
          from (
            select distinct on (lower(trim(answer.value)))
              trim(answer.value) as value,
              answer.ordinality
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(submitted.item -> 'accepted_answers') = 'array'
                  then submitted.item -> 'accepted_answers'
                else jsonb_build_array(q.correct_answer)
              end
            ) with ordinality answer(value, ordinality)
            where nullif(trim(answer.value), '') is not null
            order by lower(trim(answer.value)), answer.ordinality
          ) deduped
        ), array[q.correct_answer])
        else array[q.correct_answer]
      end,
      grading_mode = case
        when q.question_type = 'short_answer'
          and submitted.item ->> 'grading_mode' = 'semantic_review'
          then 'semantic_review'
        when q.question_type = 'short_answer' then 'accepted_answers'
        else 'exact'
      end,
      grading_config = case
        when jsonb_typeof(submitted.item -> 'grading_config') = 'object'
          then submitted.item -> 'grading_config'
        else '{}'::jsonb
      end
  from public.teacher_question_batch_items batch_item
  join lateral (
    select item
    from jsonb_array_elements(v_effective_questions) candidate(item)
    where coalesce(candidate.item ->> 'source_index', '') = batch_item.source_index::text
    limit 1
  ) submitted on true
  where batch_item.batch_id = v_batch_id
    and batch_item.question_id = q.id;

  return v_result || jsonb_build_object(
    'topicNormalizationApplied', v_parent_topic is not null,
    'parentTopic', v_parent_topic
  );
end;
$function$;

revoke all on function public.rpc_teacher_submit_question_batch_v3(uuid,jsonb)
  from public, anon;
grant execute on function public.rpc_teacher_submit_question_batch_v3(uuid,jsonb)
  to authenticated, service_role;
