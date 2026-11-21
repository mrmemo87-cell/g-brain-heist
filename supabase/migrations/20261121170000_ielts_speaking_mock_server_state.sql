-- Diagnostic Bible 2.7.0 section 10.12: what the server-side join step needs to know about a
-- recorded-examiner mock (lines, answer state, joined parts). Server-only; read-only.
create function public.rpc_ielts_speaking_mock_server_state(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; m private.ielts_speaking_mock_sittings; begin
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 if not found or s.delivery_mode<>'recorded_examiner' then raise exception 'speaking_mock_session_required'; end if;
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 return jsonb_build_object('session_id',s.id,'status',s.status,'finished',m.student_finished_at is not null,
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('key',l.key,'position',l.position,'part',l.part,'kind',l.kind,'answer_seconds',l.answer_seconds) order by l.position),'[]'::jsonb)
    from private.ielts_speaking_mock_script_lines l where l.script_id=m.script_id),
  'answers',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'line_key',x.line_key,'part',x.part,'uploaded',x.uploaded_at is not null,'missing',x.missing,
      'interrupted',x.interrupted,'verified',x.verified_at is not null,'file_deleted',x.file_deleted_at is not null) order by x.started_at),'[]'::jsonb)
    from private.ielts_speaking_mock_answers x where x.session_id=s.id),
  'parts',(select coalesce(jsonb_agg(jsonb_build_object('part',p.part,'clip_id',p.clip_id) order by p.part),'[]'::jsonb)
    from private.ielts_speaking_mock_parts p where p.session_id=s.id));
end; $$;
revoke all on function public.rpc_ielts_speaking_mock_server_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_speaking_mock_server_state(uuid) to service_role;
