-- Diagnostic Bible 2.7.0 section 10.12: automatic mix of Speaking practice mocks.
-- So classmates rarely share questions, the server chooses a mock for each student:
--   * only mocks the teacher could assign by hand (approved, released script, published or the
--     student is the named pilot);
--   * never a mock the student already has or had (a cancelled, never-started assignment does not
--     count), so a second sitting always gets new questions;
--   * the mock used least in this batch, then least in the student's school, then in code order,
--     so a list of students gets the mocks in turn.
-- A student who already has an open practice mock, or has had every mock, is skipped and reported.
-- Each choice goes through rpc_ielts_assign_speaking_mock, so every existing check still applies.

create function public.rpc_ielts_assign_speaking_mock_mix(p_assignments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; stu uuid; aid uuid; pick text; used jsonb:='{}'::jsonb; made int:=0; skipped jsonb:='[]'::jsonb;
  existing private.ielts_speaking_mock_assignments; res jsonb; begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authorized'; end if;
 if jsonb_typeof(p_assignments)<>'array' or jsonb_array_length(p_assignments) not between 1 and 60 then raise exception 'speaking_mock_assignment_list'; end if;
 for item in select value from jsonb_array_elements(p_assignments) loop
   stu:=(item->>'student_id')::uuid; aid:=(item->>'assignment_id')::uuid;
   if stu is null or aid is null then raise exception 'speaking_mock_assignment_list'; end if;
   if not private.can_review_ielts_speaking_student(stu) then raise exception using errcode='42501',message='not_authorized'; end if;
   perform pg_advisory_xact_lock(hashtextextended('speaking-mock:'||stu::text,0));
   select * into existing from private.ielts_speaking_mock_assignments where id=aid;
   if found then
     if existing.student_id<>stu then raise exception 'speaking_mock_assignment_conflict'; end if;
     used:=jsonb_set(used,array[existing.package_code],to_jsonb(coalesce((used->>existing.package_code)::int,0)+1));
     continue;
   end if;
   if exists(select 1 from private.ielts_speaking_mock_assignments a where a.student_id=stu and a.cancelled_at is null
      and not exists(select 1 from private.ielts_speaking_mock_sittings m join private.ielts_speaking_sessions s on s.id=m.session_id
        where m.assignment_id=a.id and (s.status='submitted' or m.student_finished_at is not null))) then
     skipped:=skipped||jsonb_build_object('student_id',stu,'reason','open_mock'); continue;
   end if;
   select p.code into pick from private.ielts_speaking_packages p
    where p.content->>'delivery_mode'='recorded_examiner' and p.approved_at is not null
      and exists(select 1 from private.ielts_speaking_mock_scripts sc where sc.package_code=p.code and sc.content_hash=p.content_hash and sc.released_at is not null)
      and (stu=p.pilot_student or exists(select 1 from private.ielts_speaking_releases r where r.package_code=p.code and r.content_hash=p.content_hash))
      and not exists(select 1 from private.ielts_speaking_mock_assignments a where a.student_id=stu and a.package_code=p.code and a.cancelled_at is null)
    order by coalesce((used->>p.code)::int,0),
      (select count(*) from private.ielts_speaking_mock_assignments a where a.package_code=p.code and a.cancelled_at is null
        and a.school_id is not distinct from (select u.school_id from public.users u where u.id=stu)),
      p.code
    limit 1;
   if pick is null then skipped:=skipped||jsonb_build_object('student_id',stu,'reason','no_new_mock'); continue; end if;
   res:=public.rpc_ielts_assign_speaking_mock(pick,jsonb_build_array(jsonb_build_object('student_id',stu,'assignment_id',aid)));
   made:=made+(res->>'assigned')::int;
   used:=jsonb_set(used,array[pick],to_jsonb(coalesce((used->>pick)::int,0)+1));
 end loop;
 return jsonb_build_object('assigned',made,'by_mock',used,'skipped',skipped);
end; $$;

revoke all on function public.rpc_ielts_assign_speaking_mock_mix(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_assign_speaking_mock_mix(jsonb) to authenticated;
