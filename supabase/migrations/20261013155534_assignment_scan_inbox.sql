-- Assignment-wide resume; authorization and current paper version remain mandatory.
create or replace function public.rpc_teacher_scan_inbox(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid; v_hash text; v_result jsonb;
begin
 v_id := private.paper_assignment_id(p_assignment_id);
 v_hash := private.paper_form_hash(v_id);
 select coalesce(jsonb_agg(jsonb_set(public.rpc_teacher_scan_session(s.id), '{sheets}', (
   select jsonb_agg(item.value || jsonb_build_object('scannedAt', a.created_at) order by item.ordinality)
   from jsonb_array_elements(public.rpc_teacher_scan_session(s.id)->'sheets') with ordinality item(value, ordinality)
   left join public.assignment_scan_attempts a on a.id = (item.value->>'scanId')::uuid
 )) order by scanned.latest desc, s.created_at desc, s.id), '[]'::jsonb)
 into v_result
 from public.assignment_scan_sessions s
 join lateral (
   select max(a.created_at) latest from public.assignment_scan_sheets sh
   join public.assignment_scan_attempts a on a.id = sh.latest_scan_id
   where sh.session_id = s.id
 ) scanned on scanned.latest is not null
 where s.assignment_id = v_id and s.form_hash = v_hash;
 return v_result;
end;
$$;
revoke all on function public.rpc_teacher_scan_inbox(uuid) from public, anon;
grant execute on function public.rpc_teacher_scan_inbox(uuid) to authenticated;
