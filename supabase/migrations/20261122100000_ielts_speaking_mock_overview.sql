-- Diagnostic Bible 2.7.1 section 10.12 and Visual & UX Bible 1.18.0 section 13.12: the teacher Speaking desk.
-- Read-only class overview of Speaking practice mocks for one school: every student the caller may review
-- (the canonical private.can_review_ielts_speaking_student check, one student at a time) with their current
-- mock and its true state. Practice mocks stay practice: nothing here is screener or starting-point evidence.
--   state: none (no open mock) | ready (assigned, not started) | in_progress | to_review (finished, no
--   confirmed teacher review) | reviewed (teacher review confirmed)
create function public.rpc_ielts_speaking_mock_overview(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; published int; begin
 if auth.uid() is null or p_school_id is null then raise exception using errcode='42501',message='not_authorized'; end if;
 select count(*) into published from private.ielts_speaking_packages p
  where p.content->>'delivery_mode'='recorded_examiner' and p.approved_at is not null
    and exists(select 1 from private.ielts_speaking_releases r where r.package_code=p.code and r.content_hash=p.content_hash);
 select coalesce(jsonb_agg(x order by x->>'name', x->>'id'),'[]'::jsonb) into rows from (
  select jsonb_build_object('id',u.id,'name',u.username,
    'mocks_had',(select count(*) from private.ielts_speaking_mock_assignments a where a.student_id=u.id and a.cancelled_at is null),
    'current',(select jsonb_build_object('assignment_id',a.id,'title',p.content->>'title','assigned_at',a.created_at,
        'session_id',m.session_id,'finished_at',coalesce(m.student_finished_at,s.submitted_at),
        'state',case when s.id is null then 'ready'
          when exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id and r.teacher_confirmed) then 'reviewed'
          when s.status='submitted' or m.student_finished_at is not null then 'to_review' else 'in_progress' end)
      from private.ielts_speaking_mock_assignments a join private.ielts_speaking_packages p on p.code=a.package_code
      left join private.ielts_speaking_mock_sittings m on m.assignment_id=a.id
      left join private.ielts_speaking_sessions s on s.id=m.session_id
      where a.student_id=u.id and a.cancelled_at is null order by a.created_at desc, a.id limit 1)) x
  from public.users u
  where u.role='student' and u.school_id=p_school_id and coalesce(u.is_banned,false)=false
    and private.can_review_ielts_speaking_student(u.id)
  order by u.username, u.id limit 400) q(x);
 return jsonb_build_object('school_id',p_school_id,'published_mocks',published,'students',rows);
end; $$;

revoke all on function public.rpc_ielts_speaking_mock_overview(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_speaking_mock_overview(uuid) to authenticated;
