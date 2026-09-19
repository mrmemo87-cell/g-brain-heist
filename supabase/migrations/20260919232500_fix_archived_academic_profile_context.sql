-- Keep archived academic-year profiles readable when no current-placement
-- context lookup is needed. The previous wrapper referenced an unassigned
-- record on archived years.

create or replace function public.rpc_student_academic_profile_for_year(
  p_student_id uuid,
  p_subject text,
  p_academic_year_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student_id uuid := coalesce(p_student_id, auth.uid());
  v_school_id uuid;
  v_operational_year_id uuid;
  v_context record;
  v_context_start_at timestamptz := null;
  v_effective_from timestamptz := p_date_from;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select u.school_id into v_school_id
  from public.users u where u.id = v_student_id;
  if v_school_id is null then raise exception 'Student is not attached to a school'; end if;

  v_operational_year_id := public.academic_resolve_operational_year_id(v_school_id, now());
  if p_academic_year_id = v_operational_year_id then
    select * into v_context
    from private.student_current_academic_context(v_student_id, p_academic_year_id);
    v_context_start_at := v_context.context_start_at;
    if v_context_start_at is not null then
      v_effective_from := greatest(
        v_context_start_at,
        coalesce(p_date_from, v_context_start_at)
      );
    end if;
  end if;

  v_result := public.rpc_student_academic_profile_for_year_pre_context_20260919(
    v_student_id, p_subject, p_academic_year_id, v_effective_from, p_date_to
  );

  return jsonb_set(
    v_result,
    '{scope}',
    coalesce(v_result->'scope', '{}'::jsonb) || jsonb_build_object(
      'placement_context_start_at', v_context_start_at,
      'current_placement_only', p_academic_year_id = v_operational_year_id,
      'historical_placement_evidence_excluded', p_academic_year_id = v_operational_year_id
    ),
    true
  );
end;
$$;

revoke all on function public.rpc_student_academic_profile_for_year(
  uuid, text, uuid, timestamptz, timestamptz
) from public, anon;
grant execute on function public.rpc_student_academic_profile_for_year(
  uuid, text, uuid, timestamptz, timestamptz
) to authenticated, service_role;

comment on function public.rpc_student_academic_profile_for_year(uuid, text, uuid, timestamptz, timestamptz) is
  'Academic-year profile that preserves archived history and clamps only the operational year to the student current placement context.';
