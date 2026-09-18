-- Recover unsubmitted teacher PDF review drafts by immutable file hash.
-- This lets teachers resume a saved AI draft after refresh without re-running
-- extraction/generation or losing the original secured provenance record.

create or replace function public.rpc_teacher_question_pdf_drafts_by_hash(
  p_sha256 text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_hash text := lower(trim(coalesce(p_sha256, '')));
  v_drafts jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_pdf_sha256';
  end if;

  if not exists (
    select 1
    from public.teachers t
    where t.user_id = v_actor
  ) then
    raise exception using errcode = '42501', message = 'teacher_required';
  end if;

  select coalesce(jsonb_agg(d.payload order by d.completed_at desc), '[]'::jsonb)
    into v_drafts
  from (
    select
      e.completed_at,
      jsonb_build_object(
        'extractionId', e.id,
        'model', e.extraction_model,
        'sourceSha256', e.source_file_sha256,
        'sourceFileSize', e.source_file_size,
        'detectedPageCount', e.detected_page_count,
        'processingMode', e.processing_mode,
        'detectedDocumentType', e.detected_document_type,
        'documentTypeConfidence', coalesce((e.extraction_payload ->> 'document_type_confidence')::numeric, 0),
        'sourceRightsAttested', e.source_rights_attested,
        'document_title', coalesce(e.extraction_payload ->> 'document_title', e.source_file_name),
        'document_summary', coalesce(e.extraction_payload ->> 'document_summary', ''),
        'questions', coalesce(e.extraction_payload -> 'questions', '[]'::jsonb),
        'sourceObjectPath', e.source_object_path,
        'sourceFileName', e.source_file_name,
        'completedAt', e.completed_at,
        'processingRequest', e.processing_request
      ) as payload
    from public.teacher_question_pdf_extractions e
    where e.teacher_user_id = v_actor
      and e.source_file_sha256 = v_hash
      and not exists (
        select 1
        from public.teacher_question_batches b
        where b.extraction_id = e.id
      )
    order by e.completed_at desc
    limit 5
  ) d;

  return jsonb_build_object(
    'success', true,
    'drafts', v_drafts
  );
end;
$function$;

revoke all on function public.rpc_teacher_question_pdf_drafts_by_hash(text)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_teacher_question_pdf_drafts_by_hash(text)
  to authenticated, service_role;

comment on function public.rpc_teacher_question_pdf_drafts_by_hash(text) is
  'Teacher-only recovery of unsubmitted PDF review drafts by immutable source hash.';
