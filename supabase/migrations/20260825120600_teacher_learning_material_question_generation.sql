-- Source-grounded question creation from teacher learning-material PDFs.
--
-- Generation and extraction are deliberately distinct processing modes. The
-- source request and AI result remain immutable, generated items retain exact
-- page-level provenance, and all submitted questions remain private/in_review
-- and Academic Profile ineligible pending separate governance.

update storage.buckets
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'teacher-question-sources';

alter table public.teacher_question_pdf_extractions
  drop constraint if exists teacher_question_pdf_extractions_source_file_size_check;

alter table public.teacher_question_pdf_extractions
  add constraint teacher_question_pdf_extractions_source_file_size_check
    check (source_file_size between 1 and 20971520);

alter table public.teacher_question_pdf_extractions
  add column if not exists processing_mode text not null default 'extract',
  add column if not exists detected_document_type text not null default 'question_paper',
  add column if not exists processing_request jsonb not null default '{}'::jsonb,
  add column if not exists source_rights_attested boolean not null default false;

alter table public.teacher_question_pdf_extractions
  drop constraint if exists teacher_question_pdf_extraction_extraction_schema_version_check,
  drop constraint if exists teacher_question_pdf_extractions_extraction_schema_version_check,
  drop constraint if exists teacher_question_pdf_extractions_processing_mode_check,
  drop constraint if exists teacher_question_pdf_extractions_detected_document_type_check,
  drop constraint if exists teacher_question_pdf_extractions_processing_request_check,
  drop constraint if exists teacher_question_pdf_extractions_generation_rights_check;

alter table public.teacher_question_pdf_extractions
  add constraint teacher_question_pdf_extractions_extraction_schema_version_check
    check (extraction_schema_version in (1, 2)),
  add constraint teacher_question_pdf_extractions_processing_mode_check
    check (processing_mode in ('extract', 'generate', 'both')),
  add constraint teacher_question_pdf_extractions_detected_document_type_check
    check (detected_document_type in ('question_paper', 'learning_material', 'mixed', 'unsupported')),
  add constraint teacher_question_pdf_extractions_processing_request_check
    check (jsonb_typeof(processing_request) = 'object'),
  add constraint teacher_question_pdf_extractions_generation_rights_check
    check (processing_mode = 'extract' or source_rights_attested);

create index if not exists teacher_question_pdf_extractions_mode_rate_idx
  on public.teacher_question_pdf_extractions(teacher_id, processing_mode, completed_at desc);

comment on column public.teacher_question_pdf_extractions.processing_mode is
  'Explicit teacher intent: extract source questions, generate source-grounded questions, or both.';
comment on column public.teacher_question_pdf_extractions.detected_document_type is
  'AI-assisted document classification retained for review and mismatch guidance.';
comment on column public.teacher_question_pdf_extractions.processing_request is
  'Immutable teacher blueprint used for source-grounded creation; never a claim of approved curriculum alignment.';
comment on column public.teacher_question_pdf_extractions.source_rights_attested is
  'Teacher confirmation that learning material may be used for classroom question creation.';

-- The authenticated Edge Function uses its service credential to validate the
-- requesting actor before issuing a five-minute source-review URL.
grant execute on function public.is_superadmin(uuid) to service_role;

-- Validate immutable extraction provenance before entering the existing atomic
-- submission boundary. The teacher may improve question wording and taxonomy,
-- but cannot attach it to a source item that does not exist in the secured AI
-- result or bypass grounding requirements for generated candidates.
create or replace function public.rpc_teacher_submit_question_batch_v2(
  p_extraction_id uuid,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_extraction public.teacher_question_pdf_extractions%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select e.* into v_extraction
  from public.teacher_question_pdf_extractions e
  join public.teachers t on t.id = e.teacher_id
  where e.id = p_extraction_id
    and e.teacher_user_id = v_actor
    and t.user_id = v_actor;

  if v_extraction.id is null then
    raise exception using errcode = '42501', message = 'teacher_pdf_extraction_access_denied';
  end if;

  if jsonb_typeof(p_questions) <> 'array' then
    raise exception using errcode = '22023', message = 'questions_array_required';
  end if;

  if jsonb_typeof(v_extraction.extraction_payload -> 'questions') <> 'array' then
    raise exception using errcode = '23514', message = 'secured_question_provenance_missing';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_questions) submitted(item)
    where coalesce(submitted.item ->> 'source_index', '') !~ '^[0-9]{1,2}$'
      or not exists (
        select 1
        from jsonb_array_elements(v_extraction.extraction_payload -> 'questions') secured(candidate)
        where coalesce(secured.candidate ->> 'source_index', '') = submitted.item ->> 'source_index'
      )
  ) then
    raise exception using errcode = '23514', message = 'question_source_provenance_mismatch';
  end if;

  if v_extraction.processing_mode in ('generate', 'both')
     and not v_extraction.source_rights_attested then
    raise exception using errcode = '23514', message = 'source_rights_attestation_required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_questions) submitted(item)
    join lateral (
      select secured.candidate
      from jsonb_array_elements(v_extraction.extraction_payload -> 'questions') secured(candidate)
      where secured.candidate ->> 'source_index' = submitted.item ->> 'source_index'
      limit 1
    ) secured on true
    where secured.candidate ->> 'candidate_origin' = 'ai_generated_from_source'
      and (
        coalesce(secured.candidate ->> 'source_page', '') !~ '^[0-9]{1,2}$'
        or length(trim(coalesce(secured.candidate ->> 'source_grounding_note', ''))) < 20
        or length(trim(coalesce(secured.candidate ->> 'learning_objective', ''))) < 10
        or length(trim(coalesce(secured.candidate ->> 'explanation', ''))) < 10
      )
  ) then
    raise exception using errcode = '23514', message = 'generated_question_grounding_incomplete';
  end if;

  return public.rpc_teacher_submit_question_batch(p_extraction_id, p_questions);
end;
$function$;

revoke all on function public.rpc_teacher_submit_question_batch(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_teacher_submit_question_batch(uuid, jsonb)
  to service_role;

revoke all on function public.rpc_teacher_submit_question_batch_v2(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_teacher_submit_question_batch_v2(uuid, jsonb)
  to authenticated, service_role;

comment on function public.rpc_teacher_submit_question_batch_v2(uuid, jsonb) is
  'Teacher submission boundary with immutable source-index, generation-rights and page-grounding validation.';

-- Enrich the protected content vault without weakening the original inspector.
-- The secured candidate is resolved by immutable extraction + source index,
-- never from editable client metadata.
create or replace function public.rpc_superadmin_question_bank_inspector_v2(
  p_pool text default 'verified',
  p_search text default null,
  p_subject text default null,
  p_school_id uuid default null,
  p_status text default 'all',
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_questions jsonb;
begin
  if auth.uid() is null or not public.is_superadmin(auth.uid()) then
    raise exception using errcode = '42501', message = 'platform_superadmin_access_required';
  end if;

  v_result := public.rpc_superadmin_question_bank_inspector(
    p_pool, p_search, p_subject, p_school_id, p_status, p_limit, p_offset
  );

  select coalesce(jsonb_agg(
    case
      when row_data.payload -> 'submission' is null then row_data.payload
      else jsonb_set(
        row_data.payload,
        '{submission}',
        (row_data.payload -> 'submission') || jsonb_strip_nulls(jsonb_build_object(
          'processingMode', e.processing_mode,
          'detectedDocumentType', e.detected_document_type,
          'documentTypeConfidence', e.extraction_payload -> 'document_type_confidence',
          'sourceRightsAttested', e.source_rights_attested,
          'processingRequest', e.processing_request,
          'candidateOrigin', coalesce(candidate.payload ->> 'candidate_origin', 'source_question'),
          'sourceGroundingNote', candidate.payload ->> 'source_grounding_note',
          'sourceEvidenceKind', coalesce(candidate.payload ->> 'source_evidence_kind', 'text'),
          'sourceVisualDescription', candidate.payload ->> 'source_visual_description',
          'groundingConfidence', candidate.payload -> 'grounding_confidence',
          'learningObjective', candidate.payload ->> 'learning_objective'
        )),
        true
      )
    end
    order by row_data.ordinality
  ), '[]'::jsonb) into v_questions
  from jsonb_array_elements(coalesce(v_result -> 'questions', '[]'::jsonb))
    with ordinality as row_data(payload, ordinality)
  left join public.teacher_question_batch_items i
    on i.id = nullif(row_data.payload #>> '{submission,itemId}', '')::uuid
  left join public.teacher_question_batches b on b.id = i.batch_id
  left join public.teacher_question_pdf_extractions e on e.id = b.extraction_id
  left join lateral (
    select secured.payload
    from jsonb_array_elements(coalesce(e.extraction_payload -> 'questions', '[]'::jsonb)) secured(payload)
    where secured.payload ->> 'source_index' = i.source_index::text
    limit 1
  ) candidate on true;

  return jsonb_set(v_result, '{questions}', v_questions, true);
end;
$function$;

revoke all on function public.rpc_superadmin_question_bank_inspector_v2(text,text,text,uuid,text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_superadmin_question_bank_inspector_v2(text,text,text,uuid,text,integer,integer)
  to authenticated, service_role;

comment on function public.rpc_superadmin_question_bank_inspector_v2(text,text,text,uuid,text,integer,integer) is
  'Superadmin-only question vault with immutable source-grounding and generation provenance.';
