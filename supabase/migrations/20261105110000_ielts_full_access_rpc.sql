-- IELTS: one light answer to "does this learner have the full IELTS course and practice?" for the app.
--
-- Owner report 2026-11-05 (Asia/Bishkek): a school student without an IELTS seat was told on the Prime page that
-- "IELTS Prime is active", because the app treated any paid school plan as Prime. Full access follows the course rule
-- (private.ielts_course_access_reason): IELTS Prime, a school IELTS seat, staff of an IELTS school, or the owner.
create or replace function public.rpc_ielts_full_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  v_reason := private.ielts_course_access_reason();
  return jsonb_build_object(
    'full', private.ielts_course_has_full_access(),
    'reason', v_reason);
end;
$$;

revoke all on function public.rpc_ielts_full_access() from public, anon;
grant execute on function public.rpc_ielts_full_access() to authenticated;
