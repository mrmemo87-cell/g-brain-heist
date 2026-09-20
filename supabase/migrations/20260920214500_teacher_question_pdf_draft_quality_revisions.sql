-- Preserve immutable PDF extraction provenance while allowing a reviewed draft to
-- receive a later quality correction. The original extraction remains append-only;
-- this table stores a presentation/review overlay only. Submission provenance is
-- still validated against the original extraction and immutable source indexes.

create table if not exists private.teacher_question_pdf_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.teacher_question_pdf_extractions(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  quality_revision integer not null check (quality_revision > 0),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  revision_reason text not null check (length(btrim(revision_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (extraction_id, revision_number)
);

create index if not exists teacher_question_pdf_draft_revisions_lookup_idx
  on private.teacher_question_pdf_draft_revisions(extraction_id, revision_number desc);

revoke all on table private.teacher_question_pdf_draft_revisions
  from public, anon, authenticated, service_role;

create or replace function private.reject_teacher_question_pdf_draft_revision_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'teacher_question_pdf_draft_revisions_are_append_only';
end;
$$;

revoke all on function private.reject_teacher_question_pdf_draft_revision_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_teacher_question_pdf_draft_revisions_immutable
  on private.teacher_question_pdf_draft_revisions;
create trigger trg_teacher_question_pdf_draft_revisions_immutable
before update or delete on private.teacher_question_pdf_draft_revisions
for each row execute function private.reject_teacher_question_pdf_draft_revision_mutation();

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
        'questions', coalesce(r.questions, e.extraction_payload -> 'questions', '[]'::jsonb),
        'sourceObjectPath', e.source_object_path,
        'sourceFileName', e.source_file_name,
        'completedAt', e.completed_at,
        'processingRequest', e.processing_request || case
          when r.quality_revision is null then '{}'::jsonb
          else jsonb_build_object('quality_revision', r.quality_revision)
        end
      ) as payload
    from public.teacher_question_pdf_extractions e
    left join lateral (
      select revision.questions, revision.quality_revision
      from private.teacher_question_pdf_draft_revisions revision
      where revision.extraction_id = e.id
      order by revision.revision_number desc
      limit 1
    ) r on true
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

comment on table private.teacher_question_pdf_draft_revisions is
  'Append-only quality overlays for unsubmitted teacher PDF review drafts. Original extraction provenance is never rewritten.';

comment on function public.rpc_teacher_question_pdf_drafts_by_hash(text) is
  'Teacher-only recovery of unsubmitted PDF review drafts by immutable source hash, applying the latest append-only quality overlay when present.';
