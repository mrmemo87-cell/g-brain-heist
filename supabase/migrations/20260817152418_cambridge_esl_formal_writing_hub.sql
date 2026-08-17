-- Cambridge-aligned formal Writing Hub: Primary ESL 0057 (Grades 1-6),
-- Lower Secondary ESL 0876 (Grades 7-9), and IGCSE ESL 0510 (Grades 10-12).

create table if not exists public.bh_writing_voided_attempts (
  id uuid primary key default gen_random_uuid(), attempt_key text not null unique,
  student_id uuid not null references public.users(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  prompt_id text, prompt_text text not null, grade integer not null check (grade between 1 and 12),
  genre text not null check (genre in ('email','article','review','story','essay','report','paragraph')),
  draft_snapshot text not null default '', integrity_signals jsonb not null default '{}'::jsonb,
  reason text not null check (reason in ('second_tab_change','time_expired')),
  created_at timestamptz not null default now()
);
create index if not exists idx_bh_writing_voided_attempts_student_created on public.bh_writing_voided_attempts(student_id,created_at desc);
alter table public.bh_writing_voided_attempts enable row level security;
revoke all on table public.bh_writing_voided_attempts from public,anon,authenticated;
grant select,insert,update,delete on table public.bh_writing_voided_attempts to service_role;

create or replace function public.rpc_bh_writing_void_formal_attempt(
  p_attempt_key text,p_prompt_id text,p_prompt_text text,p_grade integer,p_genre text,
  p_draft_snapshot text,p_integrity_signals jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_student_id uuid := (select auth.uid()); v_school_id uuid;
begin
  if v_student_id is null then raise exception 'Not authenticated'; end if;
  if p_attempt_key is null or p_attempt_key !~ '^attempt_[A-Za-z0-9_-]{8,80}$' then raise exception 'Invalid attempt key'; end if;
  if p_grade is null or p_grade < 1 or p_grade > 12 then raise exception 'Grade must be between 1 and 12'; end if;
  if p_genre not in ('email','article','review','story','essay','report','paragraph') then raise exception 'Unsupported writing genre'; end if;
  if p_reason not in ('second_tab_change','time_expired') then raise exception 'Unsupported void reason'; end if;
  select c.school_id into v_school_id from public.class_students cs join public.classes c on c.id=cs.class_id
    where cs.student_id=v_student_id order by c.created_at desc nulls last limit 1;
  insert into public.bh_writing_voided_attempts(attempt_key,student_id,school_id,prompt_id,prompt_text,grade,genre,draft_snapshot,integrity_signals,reason)
  values(p_attempt_key,v_student_id,v_school_id,nullif(trim(p_prompt_id),''),coalesce(p_prompt_text,''),p_grade,p_genre,
    coalesce(p_draft_snapshot,''),coalesce(p_integrity_signals,'{}'::jsonb),p_reason) on conflict(attempt_key) do nothing;
  return jsonb_build_object('recorded',true);
end $$;

delete from public.bh_writing_prompt_bank where payload->>'bank_version'='cambridge-esl-writing-bank-v1';
with profiles(grade,syllabus_code,syllabus_year,framework_version,minimum_words,target_words,maximum_words,minutes) as (values
 (1,'0057',null,'teaching-from-2021',15,25,40,15),(2,'0057',null,'teaching-from-2021',25,40,60,18),
 (3,'0057',null,'teaching-from-2021',40,60,80,20),(4,'0057',null,'teaching-from-2021',55,80,105,25),
 (5,'0057',null,'teaching-from-2021',70,100,130,30),(6,'0057',null,'teaching-from-2021',85,120,150,35),
 (7,'0876',null,'teaching-from-2021',100,130,160,35),(8,'0876',null,'teaching-from-2021',110,145,180,40),
 (9,'0876',null,'teaching-from-2021',120,160,200,45),(10,'0510','2024-2026','syllabus-2024-2026',120,140,160,30),
 (11,'0510','2024-2026','syllabus-2024-2026',120,140,160,30),(12,'0510','2024-2026','syllabus-2024-2026',120,140,160,30)
), genres(genre,instruction,audience,purpose,register) as (values
 ('email','Write an email that responds to every point and uses a suitable opening and ending.','a named reader','inform or request','mixed'),
 ('article','Write an article with an engaging opening, developed ideas and a clear ending.','school or community readers','inform and engage','neutral'),
 ('review','Write a review that describes, evaluates and gives a supported recommendation.','readers choosing an experience','evaluate and recommend','neutral'),
 ('story','Write a story with a clear sequence, a problem or change, and an effective ending.','a general reader','narrate and engage','neutral'),
 ('essay','Write an essay that explains a viewpoint and supports it with relevant reasons and examples.','an academic reader','explain and argue','formal'),
 ('report','Write a report with clear findings and practical recommendations. Use headings where useful.','a teacher or school leader','report and recommend','formal'),
 ('paragraph','Write one focused paragraph with a clear main idea, supporting detail and a closing sentence.','a classroom reader','describe or explain','neutral')
), scenarios(number,title,situation,point_one,point_two,point_three) as (values
 (1,'School garden','Your school is planning a small garden','say what should be grown','explain how students can help','describe one benefit'),
 (2,'Class visit','Your class is planning a visit to a local place','name the best place to visit','explain what students could learn','suggest how to prepare'),
 (3,'Library improvement','The school library will be improved','describe one current problem','suggest one useful change','explain how the change helps'),
 (4,'Sports afternoon','The school wants to organise a sports afternoon','choose suitable activities','explain how everyone can join','suggest one safety rule'),
 (5,'Lost property','Many useful items are being left around school','describe the problem','suggest a better lost-property system','explain how students can help'),
 (6,'Celebration day','Your class will celebrate an achievement','describe what should happen','explain who should be invited','suggest one memorable detail'),
 (7,'Helpful person','Someone in your community has helped others','describe what the person did','explain why it mattered','say how the person should be thanked'),
 (8,'New club','Students can propose a new school club','describe the club','explain what members would do','persuade students to join'),
 (9,'Healthy routine','Your class is discussing healthy daily routines','describe one useful habit','explain why it works','suggest how students can start'),
 (10,'Cleaner environment','Students want to reduce waste in the local area','identify one waste problem','propose a realistic action','explain the likely result')
), generated as (
 select p.*,g.*,s.*,format('%s. %s Your response must: %s; %s; and %s. %s',s.situation,
   case when p.grade<=3 then 'Use clear, age-appropriate sentences.' when p.grade<=6 then 'Develop each idea with a relevant detail.' else 'Develop your ideas for the stated audience and purpose.' end,
   s.point_one,s.point_two,s.point_three,g.instruction) prompt_text from profiles p cross join genres g cross join scenarios s
)
insert into public.bh_writing_prompt_bank(payload)
select jsonb_build_object(
 'id',format('cambridge-esl-g%s-%s-%s',grade,genre,lpad(number::text,2,'0')),'bank_version','cambridge-esl-writing-bank-v1',
 'title',format('Grade %s %s · %s',grade,initcap(genre),title),'prompt_text',prompt_text,'genre',genre,'grade',grade,
 'grade_band',format('%s-%s',grade,grade),'difficulty_label',case when grade<=6 then 'foundational' when grade<=9 then 'core' else 'stretch' end,
 'minimum_word_count',minimum_words,'target_word_count',target_words,'maximum_word_count',maximum_words,'time_limit_seconds',minutes*60,
 'syllabus_code',syllabus_code,'syllabus_year',syllabus_year,'framework_version',framework_version,
 'rubric_version','cambridge-esl-writing-rubric-v1','is_active',true,'is_archived',false,'safety_status','approved','prompt_quality_flag','ok','usage_count',0,
 'focus_tags',jsonb_build_array('task_response','idea_development','audience_awareness'),'context_tags',jsonb_build_array('school','community'),
 'curriculum_tags',jsonb_build_array('cambridge-esl',syllabus_code,framework_version),
 'task_rules',jsonb_build_object('audience',audience,'purpose',purpose,'register',register,
   'required_content_points',jsonb_build_array(point_one,point_two,point_three),'minimum_word_count',minimum_words,
   'target_word_count',target_words,'maximum_word_count',maximum_words,'time_limit_seconds',minutes*60,'formal_attempt',true,
   'official_exam_response_type',syllabus_code='0510' and genre in ('email','article','review','essay','report'),
   'alignment_note',case when syllabus_code='0510' and genre in ('story','paragraph') then 'Cambridge-aligned internal skill task; not labelled as an official 0510 paper response type.' else 'Cambridge-aligned task for the stored programme and framework or syllabus version.' end),
 'rubric_snapshot',jsonb_build_object('rubric_version','cambridge-esl-writing-rubric-v1','programme_code',syllabus_code,
   'syllabus_year',syllabus_year,'framework_version',framework_version,'grade',grade,'scoring_scale','four criteria, each scored 0-5; total 20',
   'criteria',jsonb_build_object(
     'content',jsonb_build_object('max_score',5,'stage_standard',format('Relevant coverage and development expected at Grade %s.',grade)),
     'communicative_achievement',jsonb_build_object('max_score',5,'stage_standard',format('Audience, purpose, register and genre control expected at Grade %s.',grade)),
     'organisation',jsonb_build_object('max_score',5,'stage_standard',format('Progression, cohesion and paragraph control expected at Grade %s.',grade)),
     'language',jsonb_build_object('max_score',5,'stage_standard',format('Range and accuracy expected at Grade %s.',grade))),
   'evidence_rule','Every criterion requires exact quotations and character offsets from the submitted text.',
   'confidence_rule','Every criterion requires confidence and one improvement action; low confidence or verifier disagreement requires teacher review.',
   'verification_passes',2,
   'official_0510_mapping',case when syllabus_code='0510' and genre in ('email','article','review','essay','report') then
      jsonb_build_object('content_mark_scheme_max',6,'language_mark_scheme_max',9,'note','Official Cambridge mark-scheme dimensions are retained in the snapshot and reported through the common four-criterion academic profile scale.') else null end)
) from generated;

do $$ begin
 if (select count(*) from public.bh_writing_prompt_bank where payload->>'bank_version'='cambridge-esl-writing-bank-v1')<>840 then raise exception 'Cambridge Writing Hub bank must contain exactly 840 prompts'; end if;
 if exists(select 1 from public.bh_writing_prompt_bank where payload->>'bank_version'='cambridge-esl-writing-bank-v1'
   group by (payload->>'grade')::integer,payload->>'genre' having count(*)<>10) then raise exception 'Every grade and genre must contain exactly 10 prompts'; end if;
end $$;

create or replace function public.rpc_bh_writing_student_prompt(p_grade integer,p_genre text,p_current_prompt_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_student_id uuid:=(select auth.uid()); v_prompt jsonb;
begin
 if v_student_id is null then raise exception 'Not authenticated'; end if;
 if p_grade is null or p_grade<1 or p_grade>12 then raise exception 'Grade must be between 1 and 12'; end if;
 if p_genre not in ('email','article','review','story','essay','report','paragraph') then raise exception 'Unsupported writing genre'; end if;
 select jsonb_build_object('prompt_id',pb.payload->>'id','prompt_text',pb.payload->>'prompt_text','title',pb.payload->>'title',
   'genre',pb.payload->>'genre','difficulty_label',pb.payload->>'difficulty_label',
   'minimum_word_count',(pb.payload->>'minimum_word_count')::integer,'target_word_count',(pb.payload->>'target_word_count')::integer,
   'maximum_word_count',(pb.payload->>'maximum_word_count')::integer,'time_limit_seconds',(pb.payload->>'time_limit_seconds')::integer,
   'syllabus_code',pb.payload->>'syllabus_code','syllabus_year',pb.payload->>'syllabus_year','framework_version',pb.payload->>'framework_version',
   'rubric_version',pb.payload->>'rubric_version','task_rules',pb.payload->'task_rules','rubric_snapshot',pb.payload->'rubric_snapshot',
   'focus_tags',pb.payload->'focus_tags','context_tags',pb.payload->'context_tags','curriculum_tags',pb.payload->'curriculum_tags','pool_size',10)
 into v_prompt from public.bh_writing_prompt_bank pb where pb.payload->>'bank_version'='cambridge-esl-writing-bank-v1'
   and (pb.payload->>'grade')::integer=p_grade and pb.payload->>'genre'=p_genre and coalesce((pb.payload->>'is_active')::boolean,false)
   and pb.payload->>'safety_status'='approved'
 order by case when pb.payload->>'id'=nullif(trim(p_current_prompt_id),'') then 1 else 0 end,
   md5(v_student_id::text||current_date::text||pb.payload->>'id') limit 1;
 return v_prompt;
end $$;

create or replace function public.rpc_bh_writing_student_integrity_mode() returns jsonb language sql security definer set search_path=''
as $$ select case when auth.uid() is null then null else jsonb_build_object('mode','formal','class_id',null,'class_name','Formal Cambridge-aligned assessment') end $$;

create or replace function public.rpc_bh_writing_teacher_attempts(p_student_id text,p_genre text default null,p_limit int default 80)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_sid uuid:=public.bh_writing_resolve_student_uuid(p_student_id); v_genre text:=nullif(trim(p_genre),''); v_limit int:=greatest(1,least(coalesce(p_limit,80),200));
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if not public.can_access_bh_writing_student(v_sid) then raise exception 'Forbidden: teacher is not authorized for this student'; end if;
 return (with combined as (
  select a.id row_id,a.created_at,jsonb_build_object('row_id',a.id,'attempt_id',coalesce(a.payload->>'id',a.id::text),'student_id',coalesce(a.payload->>'student_id',a.payload->>'user_id'),
   'genre',coalesce(a.payload->>'genre','essay'),'attempt_type',a.payload->>'attempt_type','attempt_number',nullif(a.payload->>'attempt_number','')::int,
   'retry_kind',a.payload->>'retry_kind','revision_cycle_id',a.payload->>'revision_cycle_id','parent_attempt_id',a.payload->>'parent_attempt_id',
   'prompt_id',a.payload->>'prompt_id','prompt_text',coalesce(a.payload->>'prompt_text',''),'student_submission',coalesce(a.payload->>'student_submission',''),
   'assessment',coalesce(a.payload->'assessment','{}'::jsonb),'rich_feedback',coalesce(a.payload->'rich_feedback','{}'::jsonb),
   'integrity_signals',coalesce(a.payload->'integrity_signals','{}'::jsonb),'attempt_status','submitted','created_at',a.created_at) item
  from public.bh_writing_attempts a where (coalesce(a.payload->>'student_id',a.payload->>'user_id'))::uuid=v_sid and (v_genre is null or a.payload->>'genre'=v_genre)
  union all select v.id,v.created_at,jsonb_build_object('row_id',v.id,'attempt_id',v.attempt_key,'student_id',v.student_id,'genre',v.genre,
   'attempt_type','formal_void','attempt_number',null,'retry_kind',null,'revision_cycle_id',null,'parent_attempt_id',null,'prompt_id',v.prompt_id,
   'prompt_text',v.prompt_text,'student_submission',v.draft_snapshot,'assessment','{}'::jsonb,'rich_feedback','{}'::jsonb,
   'integrity_signals',v.integrity_signals,'attempt_status',v.reason,'created_at',v.created_at)
  from public.bh_writing_voided_attempts v where v.student_id=v_sid and (v_genre is null or v.genre=v_genre)
 ),limited as(select * from combined order by created_at desc,row_id desc limit v_limit)
 select coalesce(jsonb_agg(item order by created_at desc,row_id desc),'[]'::jsonb) from limited);
end $$;

revoke all on function public.rpc_bh_writing_void_formal_attempt(text,text,text,integer,text,text,jsonb,text) from public,anon;
grant execute on function public.rpc_bh_writing_void_formal_attempt(text,text,text,integer,text,text,jsonb,text) to authenticated;
revoke all on function public.rpc_bh_writing_student_prompt(integer,text,text) from public,anon;
grant execute on function public.rpc_bh_writing_student_prompt(integer,text,text) to authenticated;
revoke all on function public.rpc_bh_writing_student_integrity_mode() from public,anon;
grant execute on function public.rpc_bh_writing_student_integrity_mode() to authenticated;
revoke all on function public.rpc_bh_writing_teacher_attempts(text,text,int) from public,anon;
grant execute on function public.rpc_bh_writing_teacher_attempts(text,text,int) to authenticated;
do $$
begin
 if to_regprocedure('public.rpc_bh_writing_teacher_set_integrity_mode(uuid,text)') is not null then
  execute 'revoke execute on function public.rpc_bh_writing_teacher_set_integrity_mode(uuid,text) from authenticated';
 end if;
end $$;
comment on function public.rpc_bh_writing_student_prompt(integer,text,text) is 'Returns one exact-grade Cambridge ESL formal task from a 10-prompt genre pool.';
comment on table public.bh_writing_voided_attempts is 'Fail-closed evidence archive for timed-out and second-tab-change formal writing attempts.';
