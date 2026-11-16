-- Any second or later computer attempt of the same mock is practice, whatever the timestamps (Bible 12A exposure).
create or replace function public.rpc_ielts_mock_cbt_start(p_code text) returns jsonb
language plpgsql volatile security definer set search_path to '' as $$
declare v_actor uuid := auth.uid(); f private.ielts_mock_cbt_forms; v_id uuid; v_no int;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'not_authenticated'; end if;
  select id into v_id from private.ielts_mock_cbt_attempts where student_id = v_actor and mock_code = p_code and status = 'in_progress';
  if v_id is not null then return jsonb_build_object('attempt_id', v_id, 'resumed', true); end if;
  if not private.ielts_mock_cbt_can_take(p_code) then raise exception using errcode = '42501', message = 'mock_not_available'; end if;
  select * into f from private.ielts_mock_cbt_forms where code = p_code;
  perform pg_advisory_xact_lock(hashtext('ielts_mock_cbt:' || v_actor::text || ':' || p_code));
  select id into v_id from private.ielts_mock_cbt_attempts where student_id = v_actor and mock_code = p_code and status = 'in_progress';
  if v_id is not null then return jsonb_build_object('attempt_id', v_id, 'resumed', true); end if;
  select coalesce(max(attempt_no), 0) + 1 into v_no from private.ielts_mock_cbt_attempts where student_id = v_actor and mock_code = p_code;
  insert into private.ielts_mock_cbt_attempts(student_id, mock_code, form_version, content_sha256, attempt_no, exposed)
  values (v_actor, f.code, f.version, f.content_sha256, v_no, v_no > 1 or private.ielts_mock_cbt_seen_before(v_actor, f.code, now()))
  returning id into v_id;
  return jsonb_build_object('attempt_id', v_id, 'resumed', false);
end $$;
revoke all on function public.rpc_ielts_mock_cbt_start(text) from public, anon;
grant execute on function public.rpc_ielts_mock_cbt_start(text) to authenticated;
