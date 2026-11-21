-- Diagnostic Bible 2.7.0 section 10.12: reads for the teacher and owner screens of the
-- recorded-examiner Speaking practice mock. Read-only.

-- Mocks a teacher may assign: approved, with a released examiner script.
create function public.rpc_ielts_speaking_mock_catalog()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('code',p.code,'title',p.content->>'title',
   'published',exists(select 1 from private.ielts_speaking_releases r where r.package_code=p.code and r.content_hash=p.content_hash),
   'pilot_student',p.pilot_student,'script_version',(select max(s.version) from private.ielts_speaking_mock_scripts s where s.package_code=p.code and s.content_hash=p.content_hash and s.released_at is not null))
   order by p.code),'[]'::jsonb)
  from private.ielts_speaking_packages p
  where p.content->>'delivery_mode'='recorded_examiner' and p.approved_at is not null
    and exists(select 1 from private.ielts_speaking_mock_scripts s where s.package_code=p.code and s.content_hash=p.content_hash and s.released_at is not null));
end; $$;

-- Where each answer sits in a joined part. Reviewers also see the question text; the student sees
-- only the timings of their own answers.
create function public.rpc_ielts_speaking_mock_segments(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; reviewer boolean; m private.ielts_speaking_mock_sittings; begin
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 if not found or not private.can_access_ielts_speaking(s.id) then raise exception using errcode='42501',message='not_authorized'; end if;
 if s.delivery_mode<>'recorded_examiner' then return jsonb_build_object('mock',false); end if;
 reviewer:=private.can_review_ielts_speaking_student(s.student_id);
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 return jsonb_build_object('mock',true,
  'parts',(select coalesce(jsonb_agg(jsonb_build_object('part',p.part,'clip_id',p.clip_id,
     'answers',(select coalesce(jsonb_agg(jsonb_build_object('line_key',seg->>'line_key','start',(seg->>'start')::numeric,'end',(seg->>'end')::numeric,
         'question',case when reviewer then l.body end,'interrupted',coalesce(x.interrupted,false)) order by (seg->>'start')::numeric),'[]'::jsonb)
       from jsonb_array_elements(p.segments) seg
       left join private.ielts_speaking_mock_script_lines l on l.script_id=m.script_id and l.key=seg->>'line_key'
       left join private.ielts_speaking_mock_answers x on x.session_id=s.id and x.line_key=seg->>'line_key'),
     'lost',(select coalesce(jsonb_agg(case when reviewer then l.body else l.key end order by l.position),'[]'::jsonb)
       from private.ielts_speaking_mock_answers x join private.ielts_speaking_mock_script_lines l on l.script_id=m.script_id and l.key=x.line_key
       where x.session_id=s.id and x.part=p.part and x.missing)) order by p.part),'[]'::jsonb)
   from private.ielts_speaking_mock_parts p where p.session_id=s.id),
  'checks',case when reviewer then (select checks from private.ielts_speaking_mock_sittings where session_id=s.id) end,
  'replays',case when reviewer then (select count(*) from private.ielts_speaking_mock_replays r where r.session_id=s.id) end);
end; $$;

-- The owner's overview of mock packages and their examiner script versions.
create function public.rpc_ielts_speaking_mock_owner_overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('code',p.code,'title',p.content->>'title','content_hash',p.content_hash,
   'approved',p.approved_at is not null,
   'published',exists(select 1 from private.ielts_speaking_releases r where r.package_code=p.code and r.content_hash=p.content_hash),
   'scripts',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'released_at',s.released_at,'created_at',s.created_at) order by s.version desc),'[]'::jsonb)
      from private.ielts_speaking_mock_scripts s where s.package_code=p.code)) order by p.code),'[]'::jsonb)
  from private.ielts_speaking_packages p where p.content->>'delivery_mode'='recorded_examiner');
end; $$;

revoke all on function public.rpc_ielts_speaking_mock_catalog() from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_segments(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_owner_overview() from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_speaking_mock_catalog(), public.rpc_ielts_speaking_mock_segments(uuid), public.rpc_ielts_speaking_mock_owner_overview() to authenticated;
