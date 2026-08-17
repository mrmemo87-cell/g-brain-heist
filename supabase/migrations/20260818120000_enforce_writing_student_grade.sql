-- Formal Writing Hub grade authority must be resolved server-side.

create or replace function public.bh_writing_authoritative_student_grade(p_student_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select grade_value
  from (
    select coalesce(
      (
        select nullif(regexp_replace(coalesce(c.grade_level, ''), '[^0-9]', '', 'g'), '')::integer
        from public.class_students cs
        join public.classes c on c.id = cs.class_id
        where cs.student_id = p_student_id
          and coalesce(c.is_active, true) = true
        order by c.created_at desc nulls last, c.id
        limit 1
      ),
      (
        select sp.grade
        from public.bh_writing_student_profiles sp
        where sp.student_id = p_student_id
        order by sp.updated_at desc nulls last
        limit 1
      ),
      (
        select nullif(regexp_replace(coalesce(u.grade, ''), '[^0-9]', '', 'g'), '')::integer
        from public.users u
        where u.id = p_student_id
      )
    ) as grade_value
  ) resolved
  where grade_value between 1 and 12;
$$;

revoke all on function public.bh_writing_authoritative_student_grade(uuid) from public, anon, authenticated;
grant execute on function public.bh_writing_authoritative_student_grade(uuid) to service_role;

create or replace function public.rpc_bh_writing_student_prompt(p_grade integer,p_genre text,p_current_prompt_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_student_id uuid := (select auth.uid());
 v_grade integer;
 v_prompt jsonb;
begin
 if v_student_id is null then raise exception 'Not authenticated'; end if;
 v_grade := public.bh_writing_authoritative_student_grade(v_student_id);
 if v_grade is null then raise exception 'An authoritative grade between 1 and 12 is required'; end if;
 if p_grade is distinct from v_grade then raise exception 'Requested grade does not match the student record'; end if;
 if p_genre not in ('email','article','review','story','essay','report','paragraph') then raise exception 'Unsupported writing genre'; end if;
 select jsonb_build_object('prompt_id',pb.payload->>'id','prompt_text',pb.payload->>'prompt_text','title',pb.payload->>'title',
   'genre',pb.payload->>'genre','difficulty_label',pb.payload->>'difficulty_label',
   'minimum_word_count',(pb.payload->>'minimum_word_count')::integer,'target_word_count',(pb.payload->>'target_word_count')::integer,
   'maximum_word_count',(pb.payload->>'maximum_word_count')::integer,'time_limit_seconds',(pb.payload->>'time_limit_seconds')::integer,
   'syllabus_code',pb.payload->>'syllabus_code','syllabus_year',pb.payload->>'syllabus_year','framework_version',pb.payload->>'framework_version',
   'rubric_version',pb.payload->>'rubric_version','task_rules',pb.payload->'task_rules','rubric_snapshot',pb.payload->'rubric_snapshot',
   'focus_tags',pb.payload->'focus_tags','context_tags',pb.payload->'context_tags','curriculum_tags',pb.payload->'curriculum_tags','pool_size',10)
 into v_prompt from public.bh_writing_prompt_bank pb where pb.payload->>'bank_version'='cambridge-esl-writing-bank-v1'
   and (pb.payload->>'grade')::integer=v_grade and pb.payload->>'genre'=p_genre and coalesce((pb.payload->>'is_active')::boolean,false)
   and pb.payload->>'safety_status'='approved'
 order by case when pb.payload->>'id'=nullif(trim(p_current_prompt_id),'') then 1 else 0 end,
   md5(v_student_id::text||current_date::text||pb.payload->>'id') limit 1;
 return v_prompt;
end $$;

create or replace function public.rpc_bh_writing_void_formal_attempt(
  p_attempt_key text,p_prompt_id text,p_prompt_text text,p_grade integer,p_genre text,
  p_draft_snapshot text,p_integrity_signals jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_student_id uuid := (select auth.uid());
 v_school_id uuid;
 v_grade integer;
begin
 if v_student_id is null then raise exception 'Not authenticated'; end if;
 v_grade := public.bh_writing_authoritative_student_grade(v_student_id);
 if v_grade is null then raise exception 'An authoritative grade between 1 and 12 is required'; end if;
 if p_grade is distinct from v_grade then raise exception 'Requested grade does not match the student record'; end if;
 if p_attempt_key is null or p_attempt_key !~ '^attempt_[A-Za-z0-9_-]{8,80}$' then raise exception 'Invalid attempt key'; end if;
 if p_genre not in ('email','article','review','story','essay','report','paragraph') then raise exception 'Unsupported writing genre'; end if;
 if p_reason not in ('second_tab_change','time_expired') then raise exception 'Unsupported void reason'; end if;
 select c.school_id into v_school_id from public.class_students cs join public.classes c on c.id=cs.class_id
   where cs.student_id=v_student_id order by c.created_at desc nulls last limit 1;
 insert into public.bh_writing_voided_attempts(attempt_key,student_id,school_id,prompt_id,prompt_text,grade,genre,draft_snapshot,integrity_signals,reason)
 values(p_attempt_key,v_student_id,v_school_id,nullif(trim(p_prompt_id),''),coalesce(p_prompt_text,''),v_grade,p_genre,
   coalesce(p_draft_snapshot,''),coalesce(p_integrity_signals,'{}'::jsonb),p_reason) on conflict(attempt_key) do nothing;
 return jsonb_build_object('recorded',true);
end $$;

revoke all on function public.rpc_bh_writing_student_prompt(integer,text,text) from public,anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer,text,text) to authenticated;
revoke all on function public.rpc_bh_writing_void_formal_attempt(text,text,text,integer,text,text,jsonb,text) from public,anon;
grant execute on function public.rpc_bh_writing_void_formal_attempt(text,text,text,integer,text,text,jsonb,text) to authenticated;

comment on function public.bh_writing_authoritative_student_grade(uuid) is 'Resolves the server-authoritative grade used by the formal Writing Hub.';
