-- Historical Writing Hub attempts predate reliable grade/class snapshots for
-- some students. Do not relabel those submissions with today's placement.

alter function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
  rename to rpc_bh_writing_teacher_report_context_v2_20260919;

revoke all on function public.rpc_bh_writing_teacher_report_context_v2_20260919(text, text, text, boolean)
  from public, anon, authenticated, service_role;

create function public.rpc_bh_writing_teacher_report(
  p_student_id text,
  p_month text default null,
  p_genre text default null,
  p_include_snippet boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report jsonb;
begin
  v_report := public.rpc_bh_writing_teacher_report_context_v2_20260919(
    p_student_id, p_month, p_genre, p_include_snippet
  );

  if v_report->>'academic_context' = 'historical_period' then
    v_report := jsonb_set(
      v_report,
      '{student}',
      coalesce(v_report->'student', '{}'::jsonb) || jsonb_build_object(
        'grade', null,
        'class_id', null,
        'class_name', 'Class not recorded for this historical writing evidence'
      ),
      true
    ) || jsonb_build_object(
      'historical_context_quality', 'grade_class_not_recorded',
      'historical_context_note', 'This writing is preserved as historical evidence. Its original grade/class was not recorded on the writing attempt, so the current placement is not applied retrospectively.'
    );
  end if;

  return v_report;
end;
$$;

revoke all on function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
  from public, anon;
grant execute on function public.rpc_bh_writing_teacher_report(text, text, text, boolean)
  to authenticated, service_role;

comment on function public.rpc_bh_writing_teacher_report(text, text, text, boolean) is
  'Writing teacher report with current-placement evidence isolation and explicit unknown grade/class labels for historical attempts that lack placement snapshots.';
