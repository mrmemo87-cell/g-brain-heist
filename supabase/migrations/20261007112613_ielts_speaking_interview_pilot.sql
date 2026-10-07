-- Bible 1.2.0: original three-part draft, named-user pilot only, no numeric rating.
create table private.ielts_speaking_packages (
 code text primary key, content jsonb not null, content_hash text not null,
 approved_by uuid references public.users(id), approved_at timestamptz, review_record jsonb,
 pilot_student uuid not null references public.users(id)
);
create table private.ielts_speaking_sessions (
 id uuid primary key, student_id uuid not null references public.users(id), teacher_id uuid not null references public.users(id), school_id uuid,
 package_code text not null references private.ielts_speaking_packages(code), content_hash text not null, package_snapshot jsonb not null,
 status text not null default 'in_progress' check(status in ('in_progress','submitted')), created_at timestamptz not null default now(), submitted_at timestamptz,
 evidence_kind text not null check(evidence_kind in ('first_sitting','same_form_practice')), recording_consent boolean not null check(recording_consent),
 preparation_started_at timestamptz
);
create table private.ielts_speaking_clips (
 id uuid primary key, session_id uuid not null references private.ielts_speaking_sessions(id), part integer not null check(part between 1 and 3),
 path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), duration_seconds numeric not null check(duration_seconds>0 and duration_seconds<=360),
 mime_type text not null check(mime_type='audio/wav'), interrupted boolean not null, created_at timestamptz not null default now()
);
create table private.ielts_speaking_incidents (
 id uuid primary key, session_id uuid not null references private.ielts_speaking_sessions(id), reason text not null check(reason in ('background','connection','refresh','microphone','local_save')), created_at timestamptz not null default now()
);
create table private.ielts_speaking_ai_drafts (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references private.ielts_speaking_sessions(id), requested_by uuid not null references public.users(id),
 source_hash text not null, prompt_version text not null, model text not null, state text not null default 'pending' check(state in ('pending','ready','failed')),
 fields jsonb, provider_id text, provider_model text, created_at timestamptz not null default now(), completed_at timestamptz
);
create table private.ielts_speaking_reviews (
 id uuid primary key, session_id uuid not null references private.ielts_speaking_sessions(id), source_hash text not null,
 reviewer_id uuid not null references public.users(id), fields jsonb not null, ai_draft_id uuid references private.ielts_speaking_ai_drafts(id),
 teacher_confirmed boolean not null check(teacher_confirmed), reviewed_at timestamptz not null default now()
);
create table private.ielts_speaking_audio_receipts (
 clip_id uuid primary key, session_id uuid not null references private.ielts_speaking_sessions(id), part integer not null,
 sha256 text not null, duration_seconds numeric not null, created_at timestamptz not null default now()
);
alter table private.ielts_speaking_audio_receipts enable row level security;
revoke all on private.ielts_speaking_audio_receipts from public,anon,authenticated,service_role;
create index on private.ielts_speaking_audio_receipts(session_id);
create table private.ielts_speaking_capture_starts (
 clip_id uuid primary key, session_id uuid not null references private.ielts_speaking_sessions(id), part integer not null check(part between 1 and 3), started_at timestamptz not null default now()
);
alter table private.ielts_speaking_capture_starts enable row level security;
revoke all on private.ielts_speaking_capture_starts from public,anon,authenticated,service_role;
create index on private.ielts_speaking_capture_starts(session_id);
create index on private.ielts_speaking_sessions(student_id,created_at desc);
create index on private.ielts_speaking_sessions(teacher_id,created_at desc);
create index on private.ielts_speaking_clips(session_id,part,created_at);
create index on private.ielts_speaking_reviews(session_id,reviewed_at desc);
create index on private.ielts_speaking_incidents(session_id);
create index on private.ielts_speaking_ai_drafts(requested_by,created_at desc);
create index on private.ielts_speaking_ai_drafts(session_id);
do $$ declare t text; begin foreach t in array array['packages','sessions','clips','incidents','ai_drafts','reviews'] loop
 execute format('alter table private.ielts_speaking_%I enable row level security',t);
 execute format('revoke all on private.ielts_speaking_%I from public,anon,authenticated,service_role',t);
end loop; end $$;

create function private.ielts_speaking_student_eligible(p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u where u.id=p_student and u.role='student' and not coalesce(u.is_banned,false)
 and ((u.school_id is null) or (public.school_has_module_access(u.school_id,'ielts') and exists(
 select 1 from public.school_members m where m.user_id=u.id and m.school_id=u.school_id and m.status='active'))));
$$;
create function private.can_review_ielts_speaking_student(p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()<>p_student and exists(select 1 from public.users actor join public.users u on u.id=p_student
 where actor.id=auth.uid() and not coalesce(actor.is_banned,false) and private.ielts_speaking_student_eligible(p_student) and (
 public.is_superadmin(auth.uid()) or (u.school_id is not null and private.actor_can_access_school_programme(u.school_id,'ielts',false) and (
 exists(select 1 from public.school_members m where m.user_id=auth.uid() and m.school_id=u.school_id and m.status='active' and m.role_in_school in ('school_admin','admin','owner'))
 or exists(select 1 from private.teacher_current_teaching_roster(auth.uid(),u.school_id) r where r.student_id=p_student and (
 lower(coalesce(r.academic_subject_code,'')) in ('english','ielts') or lower(trim(r.school_subject_name)) like 'english%' or lower(trim(r.school_subject_name)) like 'ielts%' or lower(trim(r.school_subject_name))='esl'))
 or (not exists(select 1 from private.teacher_current_teaching_groups(auth.uid(),u.school_id)) and exists(
 select 1 from public.class_students cs join public.classes cl on cl.id=cs.class_id and cl.school_id=u.school_id
 join public.class_teacher_assignments c on c.class_id=cs.class_id and c.school_id=u.school_id and c.teacher_user_id=auth.uid() and coalesce(c.active,true)
 where cs.student_id=p_student and (lower(trim(coalesce(c.subject,cl.subject,''))) like 'english%' or lower(trim(coalesce(c.subject,cl.subject,''))) like 'ielts%')))))));
$$;
create function private.can_access_ielts_speaking(p_session uuid,p_write boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_speaking_sessions s where s.id=p_session and (
 (not p_write and s.student_id=auth.uid() and private.ielts_speaking_student_eligible(s.student_id))
 or (private.can_review_ielts_speaking_student(s.student_id) and (not p_write or s.teacher_id=auth.uid()))));
$$;
create function private.ielts_speaking_source_hash(p_session uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object('session',s.id,'content_hash',s.content_hash,'clips',coalesce((select jsonb_agg(to_jsonb(c) order by c.part,c.created_at,c.id) from private.ielts_speaking_clips c where c.session_id=s.id),'[]'::jsonb))::text,'UTF8')),'hex') from private.ielts_speaking_sessions s where s.id=p_session;
$$;

create function private.guard_ielts_speaking_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'speaking_history_immutable'; end if;
 if tg_table_name='ielts_speaking_packages' then
   if (old.code,old.content,old.content_hash,old.pilot_student) is distinct from (new.code,new.content,new.content_hash,new.pilot_student) or old.approved_at is not null then raise exception 'speaking_package_immutable'; end if;
 elsif tg_table_name='ielts_speaking_sessions' then
   if (to_jsonb(old)-array['status','submitted_at','preparation_started_at']) is distinct from (to_jsonb(new)-array['status','submitted_at','preparation_started_at']) or old.status='submitted'
   or (old.preparation_started_at is not null and old.preparation_started_at is distinct from new.preparation_started_at) then raise exception 'speaking_history_immutable'; end if;
 elsif tg_table_name='ielts_speaking_ai_drafts' then
   if old.state<>'pending' or (to_jsonb(old)-array['state','fields','provider_id','provider_model','completed_at']) is distinct from (to_jsonb(new)-array['state','fields','provider_id','provider_model','completed_at']) then raise exception 'speaking_history_immutable'; end if;
 else raise exception 'speaking_history_immutable'; end if;
 return new;
end; $$;
do $$ declare t text; begin foreach t in array array['packages','sessions','clips','incidents','ai_drafts','reviews'] loop
 execute format('create trigger speaking_history before update or delete on private.ielts_speaking_%I for each row execute function private.guard_ielts_speaking_history()',t);
end loop; end $$;

-- Authored here, not copied from official/sample question banks. No approval is asserted.
create trigger speaking_capture_history before update or delete on private.ielts_speaking_capture_starts for each row execute function private.guard_ielts_speaking_history();
insert into private.ielts_speaking_packages(code,content,content_hash,pilot_student)
select 'bh-speaking-interview-a',c,encode(sha256(convert_to(c::text,'UTF8')),'hex'),'b30e9c28-96f1-4d34-83e9-9b28b4926f42' from (select $content${
 "code":"bh-speaking-interview-a","version":"0.1.0 / BH-SS-A-1","title":"Your Speaking starting point","rights":"Original Brains Heist LLC content. AI-assisted draft; human review required.",
 "delivery_mode":"teacher_led_in_person","taxonomy_version":"bh-speaking-constructs-draft-v1","scoring_policy":"bh-speaking-observations-v1",
 "instructions":"Speak naturally with your teacher. You do not need specialist knowledge. This recorded interview gives a development snapshot, not an IELTS band.",
 "teacher_instructions":["Confirm the student agrees to recording. Use a quiet room and a microphone that captures both speakers clearly.","Introduce the conversation and ask the student to say a short sentence so their voice can be identified. Use their first name only; do not collect identity documents.","Ask one question at a time. Allow natural answers; do not correct, coach or supply vocabulary during the interview.","Use neutral follow-ups such as Why?, Can you give an example? or How has that changed? Record any extra questions in the conditions note.","Keep Part 1 and Part 3 to four to five minutes each. Part 2 includes one minute to prepare, up to two minutes to speak, then brief follow-up questions.","If delivery fails, retain the clip and resume in a new clip. An interrupted sitting is a qualified snapshot, not a comparable uninterrupted benchmark."],
 "parts":[
 {"part":1,"title":"Everyday conversation","min_seconds":240,"max_seconds":300,"constructs":["topic_development","lexical_range","grammatical_control","intelligibility"],"questions":["Do you work or are you a student?","What do you enjoy most about your studies or work?","Is there something you would like to learn in the future? Why?","Where do you usually spend your free time?","What makes that place enjoyable for you?","Has the way you spend your free time changed since you were younger?","Do you prefer learning something alone or with other people? Why?","What helps you remember something new?"]},
 {"part":2,"title":"Your long turn","min_seconds":180,"max_seconds":240,"preparation_seconds":60,"long_turn_seconds":120,"constructs":["sustained_turn","discourse_organization","grammatical_range","stress_rhythm_intonation"],"questions":[],"cue_card":{"topic":"Describe a useful skill you learned from another person.","points":["what the skill was","who helped you learn it","how you learned it"],"explain":"Explain why this skill has been useful to you."},"follow_ups":["Do you still use this skill?","Would you like to teach it to someone else?"]},
 {"part":3,"title":"Ideas and discussion","min_seconds":240,"max_seconds":300,"constructs":["topic_development","paraphrase","lexical_precision","grammatical_range","connected_speech"],"questions":["What kinds of skills are important for young people to learn today?","How is learning from another person different from learning through a video?","Why do some people find it difficult to teach a skill they know well?","Should schools give more time to practical skills? Why or why not?","How might technology change the way people learn skills in the future?","Who should be responsible for helping adults learn new skills?"]}],
 "criteria":[{"key":"fluency_coherence","label":"Fluency and Coherence","focus":"Keep speaking, develop ideas and make your answer easy to follow."},{"key":"lexical_resource","label":"Lexical Resource","focus":"Choose clear, suitable words and explain an idea another way when needed."},{"key":"grammar_range_accuracy","label":"Grammatical Range and Accuracy","focus":"Use different sentence patterns and control grammar."},{"key":"pronunciation","label":"Pronunciation","focus":"Make your meaning clear through sounds, stress, rhythm and intonation."}]
}$content$::jsonb c) draft;

create function public.rpc_ielts_speaking_home() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p private.ielts_speaking_packages; can_teacher boolean; rows jsonb; begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into p from private.ielts_speaking_packages where code='bh-speaking-interview-a';
 can_teacher:=private.can_review_ielts_speaking_student(p.pilot_student);
 if not can_teacher and not (auth.uid()=p.pilot_student and private.ielts_speaking_student_eligible(auth.uid())) then return jsonb_build_object('available',false); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'created_at',s.created_at,'evidence_kind',s.evidence_kind,'reviewed',exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id)) order by s.created_at desc),'[]'::jsonb) into rows from private.ielts_speaking_sessions s where s.student_id=p.pilot_student and private.can_access_ielts_speaking(s.id);
 return jsonb_build_object('available',true,'can_teacher',can_teacher,'can_approve',can_teacher and public.is_superadmin(auth.uid()),'approved',p.approved_at is not null,'content_hash',p.content_hash,
 'package',case when can_teacher then p.content else null end,'student_name',(select username from public.users where id=p.pilot_student),'student_id',p.pilot_student,'sessions',rows);
end; $$;
create function public.rpc_ielts_approve_speaking_pilot(p_content_hash text,p_review_record jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.ielts_speaking_packages; begin
 select * into p from private.ielts_speaking_packages where code='bh-speaking-interview-a' for update;
 if not public.is_superadmin(auth.uid()) or not private.can_review_ielts_speaking_student(p.pilot_student) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p.content_hash<>p_content_hash or not coalesce(p_review_record @> '{"editorial":true,"task_design":true,"taxonomy":true,"difficulty_timing":true,"rights":true}',false) or length(trim(coalesce(p_review_record->>'notes','')))<10 then raise exception 'speaking_content_review_required'; end if;
 if p.approved_at is null then update private.ielts_speaking_packages set approved_by=auth.uid(),approved_at=now(),review_record=p_review_record where code=p.code; end if;
 return public.rpc_ielts_speaking_home();
end; $$;
create function public.rpc_ielts_start_speaking_pilot(p_session_id uuid,p_consent boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare p private.ielts_speaking_packages; s private.ielts_speaking_sessions; begin
 select * into p from private.ielts_speaking_packages where code='bh-speaking-interview-a';
 if not private.can_review_ielts_speaking_student(p.pilot_student) then raise exception using errcode='42501',message='not_authorized'; end if;
 if p.approved_at is null or p_consent is distinct from true then raise exception 'speaking_pilot_review_and_consent_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p.pilot_student::text,0));
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 if found then if s.teacher_id<>auth.uid() or s.student_id<>p.pilot_student then raise exception 'speaking_session_conflict'; end if; return s.id; end if;
 select * into s from private.ielts_speaking_sessions where student_id=p.pilot_student and status='in_progress' order by created_at desc limit 1;
 if found then if s.teacher_id<>auth.uid() then raise exception 'speaking_interview_already_started'; end if; return s.id; end if;
 insert into private.ielts_speaking_sessions(id,student_id,teacher_id,school_id,package_code,content_hash,package_snapshot,evidence_kind,recording_consent)
 values(p_session_id,p.pilot_student,auth.uid(),(select school_id from public.users where id=p.pilot_student),p.code,p.content_hash,p.content,
 case when exists(select 1 from private.ielts_speaking_sessions where student_id=p.pilot_student and package_code=p.code and status='submitted') then 'same_form_practice' else 'first_sitting' end,true);
 return p_session_id;
end; $$;
create function public.rpc_ielts_speaking_session(p_session_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; r private.ielts_speaking_reviews; teacher boolean; begin
 if not private.can_access_ielts_speaking(p_session_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 teacher:=private.can_review_ielts_speaking_student(s.student_id);
 select * into r from private.ielts_speaking_reviews where session_id=s.id order by reviewed_at desc,id desc limit 1;
 return jsonb_build_object('id',s.id,'student_id',s.student_id,'teacher_id',s.teacher_id,'student_name',(select username from public.users where id=s.student_id),'status',s.status,'created_at',s.created_at,
 'content_hash',s.content_hash,'package',case when teacher or s.status='submitted' then s.package_snapshot else jsonb_build_object('title',s.package_snapshot->>'title','instructions',s.package_snapshot->>'instructions','parts',case when s.preparation_started_at is null then '[]'::jsonb else jsonb_build_array(s.package_snapshot->'parts'->1) end) end,
 'clips',coalesce((select jsonb_agg(to_jsonb(c)-'session_id' order by part,created_at,id) from private.ielts_speaking_clips c where c.session_id=s.id),'[]'::jsonb),'source_hash',private.ielts_speaking_source_hash(s.id),
 'can_review',teacher,'can_record',teacher and s.teacher_id=auth.uid(),'evidence_kind',s.evidence_kind,'preparation_started_at',s.preparation_started_at,
 'incidents',(select count(*) from private.ielts_speaking_incidents where session_id=s.id),
 'review',case when r.id is null then null else jsonb_build_object('id',r.id,'fields',r.fields,'reviewed_at',r.reviewed_at,'teacher_name',(select username from public.users where id=r.reviewer_id)) end,'confidence','low','readiness_available',false);
end; $$;
create function public.rpc_ielts_speaking_prepare(p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.can_access_ielts_speaking(p_session_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 update private.ielts_speaking_sessions set preparation_started_at=now() where id=p_session_id and status='in_progress' and preparation_started_at is null;
 return public.rpc_ielts_speaking_session(p_session_id);
end; $$;
create function public.rpc_ielts_speaking_incident(p_session_id uuid,p_incident_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.can_access_ielts_speaking(p_session_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 if not exists(select 1 from private.ielts_speaking_sessions where id=p_session_id and status='in_progress') then return; end if;
 insert into private.ielts_speaking_incidents(id,session_id,reason) values(p_incident_id,p_session_id,p_reason) on conflict(id) do nothing;
end; $$;
create function public.rpc_ielts_begin_speaking_capture(p_session_id uuid,p_clip_id uuid,p_part integer) returns void language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; c private.ielts_speaking_capture_starts; begin
 if not private.can_access_ielts_speaking(p_session_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id=p_session_id for update;
 if s.status<>'in_progress' or p_part is null or p_part not between 1 and 3 then raise exception 'speaking_capture_not_available'; end if;
 if p_part=2 and (s.preparation_started_at is null or s.preparation_started_at>now()-interval '60 seconds') then raise exception 'speaking_preparation_required'; end if;
 if p_part>1 and not exists(select 1 from private.ielts_speaking_clips where session_id=s.id and part=p_part-1) then raise exception 'speaking_previous_part_required'; end if;
 select * into c from private.ielts_speaking_capture_starts where clip_id=p_clip_id;
 if found then if (c.session_id,c.part) is distinct from (p_session_id,p_part) then raise exception 'speaking_capture_conflict'; end if; return; end if;
 insert into private.ielts_speaking_capture_starts(clip_id,session_id,part) values(p_clip_id,p_session_id,p_part);
end; $$;
revoke all on function public.rpc_ielts_begin_speaking_capture(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_begin_speaking_capture(uuid,uuid,integer) to authenticated;

-- Private bucket: append-only object paths. No UPDATE, DELETE or public downloads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ielts-speaking-pilot','ielts-speaking-pilot',false,12000000,array['audio/wav']);
create function private.ielts_speaking_storage_access(p_path text,p_upload boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_speaking_sessions s where split_part(p_path,'/',1)=s.id::text and
 ((p_upload and private.can_access_ielts_speaking(s.id,true) and s.status='in_progress' and p_path ~ ('^'||s.id::text||'/[1-3]/[a-f0-9-]{36}[.]wav$') and exists(select 1 from private.ielts_speaking_capture_starts c where c.session_id=s.id and p_path=s.id::text||'/'||c.part::text||'/'||c.clip_id::text||'.wav'))
 or (not p_upload and private.can_access_ielts_speaking(s.id) and exists(select 1 from private.ielts_speaking_clips c where c.session_id=s.id and c.path=p_path))));
$$;
grant usage on schema private to authenticated;
grant execute on function private.ielts_speaking_storage_access(text,boolean) to authenticated;
create policy "Speaking pilot append audio" on storage.objects for insert to authenticated with check(bucket_id='ielts-speaking-pilot' and private.ielts_speaking_storage_access(name,true));
create policy "Speaking pilot scoped audio" on storage.objects for select to authenticated using(bucket_id='ielts-speaking-pilot' and private.ielts_speaking_storage_access(name,false));
create function public.rpc_ielts_attach_speaking_clip(p_session_id uuid,p_clip_id uuid,p_part integer,p_sha256 text,p_duration numeric,p_interrupted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare path text; c private.ielts_speaking_clips; begin
 if not private.can_access_ielts_speaking(p_session_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 path:=p_session_id::text||'/'||p_part::text||'/'||p_clip_id::text||'.wav';
 select * into c from private.ielts_speaking_clips where id=p_clip_id;
 if found then
 if (c.session_id,c.part,c.sha256,c.duration_seconds,c.interrupted) is distinct from (p_session_id,p_part,p_sha256,p_duration,p_interrupted) then raise exception 'speaking_clip_conflict'; end if;
 return public.rpc_ielts_speaking_session(p_session_id); end if;
 perform 1 from private.ielts_speaking_sessions where id=p_session_id and status='in_progress' for update;
 if not found then raise exception 'speaking_already_submitted'; end if;
 if p_part=2 and not exists(select 1 from private.ielts_speaking_sessions where id=p_session_id and preparation_started_at<=now()-interval '60 seconds') then raise exception 'speaking_preparation_required'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='ielts-speaking-pilot' and o.name=path and coalesce((o.metadata->>'size')::bigint,0) between 46 and 12000000 and o.metadata->>'mimetype'='audio/wav') then raise exception 'speaking_audio_not_uploaded'; end if;
 if not exists(select 1 from private.ielts_speaking_audio_receipts r where r.clip_id=p_clip_id and r.session_id=p_session_id and r.part=p_part and r.sha256=p_sha256 and r.duration_seconds=p_duration) then raise exception 'speaking_verified_audio_required'; end if;
 if (select count(*) from private.ielts_speaking_clips where session_id=p_session_id)>=9 then raise exception 'speaking_clip_limit'; end if;
 insert into private.ielts_speaking_clips(id,session_id,part,path,sha256,duration_seconds,mime_type,interrupted) values(p_clip_id,p_session_id,p_part,path,p_sha256,p_duration,'audio/wav',p_interrupted);
 return public.rpc_ielts_speaking_session(p_session_id);
end; $$;
create function public.rpc_ielts_verify_speaking_audio(p_session_id uuid,p_clip_id uuid,p_part integer,p_sha256 text,p_duration numeric) returns void language plpgsql security definer set search_path='' as $$
declare r private.ielts_speaking_audio_receipts; begin
 if p_part not between 1 and 3 or p_sha256 !~ '^[a-f0-9]{64}$' or p_duration not between 0.01 and 360 then raise exception 'speaking_invalid_audio'; end if;
 if not exists(select 1 from private.ielts_speaking_capture_starts where session_id=p_session_id and clip_id=p_clip_id and part=p_part) then raise exception 'speaking_capture_required'; end if;
 select * into r from private.ielts_speaking_audio_receipts where clip_id=p_clip_id;
 if found then if (r.session_id,r.part,r.sha256,r.duration_seconds) is distinct from (p_session_id,p_part,p_sha256,p_duration) then raise exception 'speaking_audio_conflict'; end if; return; end if;
 insert into private.ielts_speaking_audio_receipts(clip_id,session_id,part,sha256,duration_seconds) values(p_clip_id,p_session_id,p_part,p_sha256,p_duration);
end; $$;
revoke all on function public.rpc_ielts_verify_speaking_audio(uuid,uuid,integer,text,numeric) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_verify_speaking_audio(uuid,uuid,integer,text,numeric) to service_role;
create trigger speaking_audio_receipt_history before update or delete on private.ielts_speaking_audio_receipts for each row execute function private.guard_ielts_speaking_history();
create function public.rpc_ielts_submit_speaking_pilot(p_session_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; begin
 if not private.can_access_ielts_speaking(p_session_id,true) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id=p_session_id for update;
 if s.status='submitted' then return public.rpc_ielts_speaking_session(p_session_id); end if;
 if exists(select 1 from generate_series(1,3) n where not exists(select 1 from private.ielts_speaking_clips c where c.session_id=s.id and c.part=n)) then raise exception 'speaking_three_parts_required'; end if;
 update private.ielts_speaking_sessions set status='submitted',submitted_at=now() where id=s.id;
 return public.rpc_ielts_speaking_session(p_session_id);
end; $$;

create function private.validate_ielts_speaking_feedback(p_session uuid,p_fields jsonb) returns void language plpgsql stable security definer set search_path='' as $$
declare k text; o jsonb; e jsonb; d numeric; begin
 if jsonb_typeof(p_fields)<>'object' or (select count(*) from jsonb_object_keys(p_fields))<>3 or not p_fields ?& array['observations','next_step','delivery_comment']
 or jsonb_typeof(p_fields->'next_step')<>'string' or length(trim(p_fields->>'next_step')) not between 10 and 900 or jsonb_typeof(p_fields->'delivery_comment')<>'string' or length(p_fields->>'delivery_comment')>900
 or jsonb_typeof(p_fields->'observations')<>'object' or (select count(*) from jsonb_object_keys(p_fields->'observations'))<>4 then raise exception 'speaking_feedback_incomplete'; end if;
 foreach k in array array['fluency_coherence','lexical_resource','grammar_range_accuracy','pronunciation'] loop
 o:=p_fields->'observations'->k;
 if o is null or jsonb_typeof(o)<>'object' or (select count(*) from jsonb_object_keys(o))<>3 or not o ?& array['status','comment','evidence'] or jsonb_typeof(o->'status')<>'string' or o->>'status' not in ('observed','developing','insufficient_evidence')
 or jsonb_typeof(o->'comment')<>'string' or length(trim(o->>'comment')) not between 20 and 900 or jsonb_typeof(o->'evidence')<>'array' or jsonb_array_length(o->'evidence')>3
 or (o->>'status'<>'insufficient_evidence' and jsonb_array_length(o->'evidence')=0) then raise exception 'speaking_feedback_incomplete'; end if;
 for e in select value from jsonb_array_elements(o->'evidence') loop
 select duration_seconds into d from private.ielts_speaking_clips where session_id=p_session and id=(e->>'clip_id')::uuid;
 if d is null or jsonb_typeof(e->'start_seconds')<>'number' or jsonb_typeof(e->'end_seconds')<>'number' or not e ?& array['clip_id','start_seconds','end_seconds'] or (select count(*) from jsonb_object_keys(e))<>3
 or (e->>'start_seconds')::numeric<0 or (e->>'end_seconds')::numeric<=(e->>'start_seconds')::numeric or (e->>'end_seconds')::numeric>d then raise exception 'speaking_audio_evidence_invalid'; end if;
 end loop; end loop;
 if (exists(select 1 from private.ielts_speaking_incidents where session_id=p_session) or exists(select 1 from private.ielts_speaking_clips where session_id=p_session and interrupted)) and length(trim(p_fields->>'delivery_comment'))<10 then raise exception 'speaking_conditions_note_required'; end if;
end; $$;
create function public.rpc_ielts_share_speaking_review(p_session_id uuid,p_review_id uuid,p_expected_review_id uuid,p_source_hash text,p_fields jsonb,p_confirmed boolean,p_ai_draft_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; prior uuid; r private.ielts_speaking_reviews; begin
 if not private.can_access_ielts_speaking(p_session_id) or not exists(select 1 from private.ielts_speaking_sessions where id=p_session_id and private.can_review_ielts_speaking_student(student_id)) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id=p_session_id for update;
 if s.status<>'submitted' or p_confirmed is distinct from true or p_source_hash is distinct from private.ielts_speaking_source_hash(s.id) then raise exception 'speaking_review_confirmation_required'; end if;
 select * into r from private.ielts_speaking_reviews where id=p_review_id;
 if found then if r.session_id<>s.id or r.reviewer_id<>auth.uid() or r.fields is distinct from p_fields or r.ai_draft_id is distinct from p_ai_draft_id then raise exception 'speaking_review_conflict'; end if; return public.rpc_ielts_speaking_session(s.id); end if;
 select id into prior from private.ielts_speaking_reviews where session_id=s.id order by reviewed_at desc,id desc limit 1;
 if prior is distinct from p_expected_review_id then raise exception 'speaking_review_changed'; end if;
 if p_ai_draft_id is not null and not exists(select 1 from private.ielts_speaking_ai_drafts where id=p_ai_draft_id and session_id=s.id and requested_by=auth.uid() and state='ready' and source_hash=p_source_hash) then raise exception 'speaking_ai_draft_mismatch'; end if;
 perform private.validate_ielts_speaking_feedback(s.id,p_fields);
 insert into private.ielts_speaking_reviews(id,session_id,source_hash,reviewer_id,fields,teacher_confirmed,ai_draft_id) values(p_review_id,s.id,p_source_hash,auth.uid(),p_fields,true,p_ai_draft_id);
 return public.rpc_ielts_speaking_session(s.id);
end; $$;
create function public.rpc_ielts_claim_speaking_ai(p_session_id uuid,p_model text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; d private.ielts_speaking_ai_drafts; h text; begin
 if not private.can_access_ielts_speaking(p_session_id) or not exists(select 1 from private.ielts_speaking_sessions where id=p_session_id and private.can_review_ielts_speaking_student(student_id)) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 if s.status<>'submitted' or length(p_model) not between 3 and 100 then raise exception 'speaking_ai_source_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0)); h:=private.ielts_speaking_source_hash(s.id);
 select * into d from private.ielts_speaking_ai_drafts where session_id=s.id and requested_by=auth.uid() and source_hash=h and model=p_model and prompt_version='bh-speaking-audio-simple-v1' and state='ready' order by created_at desc limit 1;
 if found then return jsonb_build_object('id',d.id,'source_hash',h,'fields',d.fields); end if;
 if exists(select 1 from private.ielts_speaking_ai_drafts where session_id=s.id and requested_by=auth.uid() and state='pending' and created_at>now()-interval '2 minutes') then raise exception 'speaking_ai_working'; end if;
 if (select count(*) from private.ielts_speaking_ai_drafts where requested_by=auth.uid() and created_at>now()-interval '10 minutes')>=3 or (select count(*) from private.ielts_speaking_ai_drafts where requested_by=auth.uid() and created_at>now()-interval '1 day')>=20 then raise exception 'speaking_ai_rate_limit'; end if;
 insert into private.ielts_speaking_ai_drafts(session_id,requested_by,source_hash,prompt_version,model) values(s.id,auth.uid(),h,'bh-speaking-audio-simple-v1',p_model) returning * into d;
 return jsonb_build_object('id',d.id,'source_hash',h,'context',public.rpc_ielts_speaking_session(s.id));
end; $$;
create function public.rpc_ielts_finish_speaking_ai(p_draft_id uuid,p_fields jsonb,p_provider_id text,p_provider_model text default null) returns void language plpgsql security definer set search_path='' as $$
declare d private.ielts_speaking_ai_drafts; begin
 select * into d from private.ielts_speaking_ai_drafts where id=p_draft_id for update;
 if d.id is null or d.state<>'pending' then raise exception 'speaking_ai_draft_conflict'; end if;
 if p_fields is not null then perform private.validate_ielts_speaking_feedback(d.session_id,p_fields); end if;
 update private.ielts_speaking_ai_drafts set state=case when p_fields is null then 'failed' else 'ready' end,fields=p_fields,provider_id=p_provider_id,provider_model=p_provider_model,completed_at=now() where id=d.id;
end; $$;

-- Explicit privileges: only the storage predicate is visible in private.
revoke all on function public.rpc_ielts_approve_speaking_pilot(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_start_speaking_pilot(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_session(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_prepare(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_incident(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_attach_speaking_clip(uuid,uuid,integer,text,numeric,boolean) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_submit_speaking_pilot(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_share_speaking_review(uuid,uuid,uuid,text,jsonb,boolean,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_claim_speaking_ai(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_finish_speaking_ai(uuid,jsonb,text,text) from public,anon,authenticated,service_role;
revoke all on function private.ielts_speaking_student_eligible(uuid),private.can_review_ielts_speaking_student(uuid),private.can_access_ielts_speaking(uuid,boolean),private.ielts_speaking_source_hash(uuid),private.guard_ielts_speaking_history(),private.validate_ielts_speaking_feedback(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ielts_speaking_storage_access(text,boolean) from public,anon,service_role;
revoke all on function public.rpc_ielts_speaking_home(),public.rpc_ielts_approve_speaking_pilot(text,jsonb),public.rpc_ielts_start_speaking_pilot(uuid,boolean),public.rpc_ielts_speaking_session(uuid),public.rpc_ielts_speaking_prepare(uuid),public.rpc_ielts_speaking_incident(uuid,uuid,text),public.rpc_ielts_attach_speaking_clip(uuid,uuid,integer,text,numeric,boolean),public.rpc_ielts_submit_speaking_pilot(uuid),public.rpc_ielts_share_speaking_review(uuid,uuid,uuid,text,jsonb,boolean,uuid),public.rpc_ielts_claim_speaking_ai(uuid,text),public.rpc_ielts_finish_speaking_ai(uuid,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_speaking_home(),public.rpc_ielts_approve_speaking_pilot(text,jsonb),public.rpc_ielts_start_speaking_pilot(uuid,boolean),public.rpc_ielts_speaking_session(uuid),public.rpc_ielts_speaking_prepare(uuid),public.rpc_ielts_speaking_incident(uuid,uuid,text),public.rpc_ielts_attach_speaking_clip(uuid,uuid,integer,text,numeric,boolean),public.rpc_ielts_submit_speaking_pilot(uuid),public.rpc_ielts_share_speaking_review(uuid,uuid,uuid,text,jsonb,boolean,uuid),public.rpc_ielts_claim_speaking_ai(uuid,text) to authenticated;
grant execute on function public.rpc_ielts_finish_speaking_ai(uuid,jsonb,text,text) to service_role;
