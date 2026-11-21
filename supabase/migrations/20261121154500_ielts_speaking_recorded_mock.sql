-- Diagnostic Bible 2.7.0 section 10.12: recorded-examiner Speaking practice mock.
-- A teacher assigns a mock; the student takes it alone with pre-recorded examiner lines.
-- Answers are saved one by one, joined per part on the server and handed to the existing
-- interview pipeline (clips, receipts, transcription, review) unchanged.
-- Nothing here changes teacher-run interviews or Speaking screeners.

-- 1. Sittings: delivery mode and the practice-mock evidence kind ---------------------------
alter table private.ielts_speaking_sessions
  add column delivery_mode text not null default 'teacher_led_in_person'
  check (delivery_mode in ('teacher_led_in_person','recorded_examiner'));
alter table private.ielts_speaking_sessions drop constraint ielts_speaking_sessions_evidence_kind_check;
alter table private.ielts_speaking_sessions add constraint ielts_speaking_sessions_evidence_kind_check
  check (evidence_kind in ('first_sitting','same_form_practice','practice_mock'));
alter table private.ielts_speaking_sessions add constraint ielts_speaking_sessions_mock_kind_check
  check ((evidence_kind = 'practice_mock') = (delivery_mode = 'recorded_examiner'));

-- Teachers record only teacher-run interviews. Mock answers come from the student's own
-- device through the mock functions below, never through the interview recording calls.
create or replace function private.can_access_ielts_speaking(p_session uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_speaking_sessions s where s.id=p_session and (
 (not p_write and s.student_id=auth.uid() and private.ielts_speaking_student_eligible(s.student_id))
 or (private.can_review_ielts_speaking_student(s.student_id) and (not p_write or (s.teacher_id=auth.uid() and s.delivery_mode='teacher_led_in_person')))));
$$;
revoke all on function private.can_access_ielts_speaking(uuid,boolean) from public,anon,authenticated,service_role;

-- 2. Consent wording (exact text shown to the student) -------------------------------------
create table private.ielts_speaking_consent_wordings(
  version text primary key check (version ~ '^[a-z0-9_.-]{1,40}$'),
  kind text not null check (kind in ('recording','voice_improvement')),
  body text not null check (length(body) between 20 and 1200),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
insert into private.ielts_speaking_consent_wordings(version,kind,body,sha256)
select v,k,b,encode(sha256(convert_to(b,'UTF8')),'hex') from (values
 ('mock-recording-v1','recording',
  'We will record your answers. A computer service writes down what you say, and your teacher listens to your answers and checks them. Your recordings are private: only you, your teachers, your school''s IELTS team and the Brains Heist team can open them.'),
 ('mock-voice-v1','voice_improvement',
  'May Brains Heist use your recordings to make the app and its AI better? Your school says your parent or guardian has agreed, but you can still say no. Your name is removed first. Your answer does not change your test or your feedback. You can change your mind later.')
) x(v,k,b);

-- 3. School record that parents or guardians agreed to voice-improvement use ---------------
create table private.ielts_school_voice_agreements(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  active boolean not null,
  note text not null check (length(trim(note)) between 10 and 1000),
  recorded_by uuid not null references public.users(id),
  recorded_at timestamptz not null default now()
);
create index ielts_school_voice_agreements_school on private.ielts_school_voice_agreements(school_id, recorded_at desc);

-- Owner's record of a legal review. Until one exists no recording is used for improvement.
create table private.ielts_voice_improvement_legal_reviews(
  id uuid primary key default gen_random_uuid(),
  jurisdictions text[] not null check (cardinality(jurisdictions) between 1 and 20),
  note text not null check (length(trim(note)) between 20 and 2000),
  recorded_by uuid not null references public.users(id),
  recorded_at timestamptz not null default now()
);

-- 4. Examiner scripts, lines and audio ------------------------------------------------------
create table private.ielts_speaking_mock_scripts(
  id uuid primary key,
  package_code text not null references private.ielts_speaking_packages(code),
  content_hash text not null,
  version integer not null check (version >= 1),
  voice jsonb not null,
  cue_card jsonb not null,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  released_by uuid references public.users(id),
  released_at timestamptz,
  unique (package_code, version)
);
create table private.ielts_speaking_mock_script_lines(
  script_id uuid not null references private.ielts_speaking_mock_scripts(id),
  position integer not null check (position between 1 and 60),
  key text not null check (key ~ '^[a-z0-9_.-]{1,40}$'),
  part integer not null check (part between 0 and 4),
  kind text not null check (kind in ('sound_check','say','question','prepare','long_turn')),
  body text not null check (length(body) between 1 and 600),
  answer_seconds integer check (answer_seconds between 10 and 120),
  replay_allowed boolean not null default false,
  audio_key text not null check (audio_key ~ '^[a-f0-9]{64}$'),
  primary key (script_id, position),
  unique (script_id, key)
);
create table private.ielts_speaking_mock_audio(
  id uuid primary key,
  audio_key text not null check (audio_key ~ '^[a-f0-9]{64}$'),
  body text not null,
  voice jsonb not null,
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  duration_seconds numeric not null check (duration_seconds > 0 and duration_seconds <= 60),
  bytes bigint not null check (bytes between 1000 and 2000000),
  mime_type text not null check (mime_type = 'audio/mpeg'),
  provider text not null,
  provider_task_id text not null,
  rights_basis text not null check (length(trim(rights_basis)) >= 10),
  produced_at timestamptz not null default now(),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  rejected_by uuid references public.users(id),
  rejected_at timestamptz,
  review_note text,
  check (approved_at is null or rejected_at is null)
);
create unique index ielts_speaking_mock_audio_one_approved on private.ielts_speaking_mock_audio(audio_key) where approved_at is not null;

-- 5. Assignments, sittings, answers and joined parts --------------------------------------
create table private.ielts_speaking_mock_assignments(
  id uuid primary key,
  school_id uuid,
  student_id uuid not null references public.users(id),
  teacher_id uuid not null references public.users(id),
  package_code text not null references private.ielts_speaking_packages(code),
  script_id uuid not null references private.ielts_speaking_mock_scripts(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references public.users(id),
  cancelled_at timestamptz
);
create index ielts_speaking_mock_assignments_student on private.ielts_speaking_mock_assignments(student_id, created_at desc);
create table private.ielts_speaking_mock_sittings(
  session_id uuid primary key references private.ielts_speaking_sessions(id),
  assignment_id uuid not null unique references private.ielts_speaking_mock_assignments(id),
  script_id uuid not null references private.ielts_speaking_mock_scripts(id),
  checks jsonb,
  checks_passed_at timestamptz,
  student_finished_at timestamptz
);
create table private.ielts_speaking_consent_records(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references private.ielts_speaking_sessions(id),
  kind text not null check (kind in ('recording','voice_improvement')),
  asked boolean not null,
  answer boolean not null,
  wording_version text references private.ielts_speaking_consent_wordings(version),
  wording_sha256 text,
  school_agreement_id uuid references private.ielts_school_voice_agreements(id),
  answered_by uuid not null references public.users(id),
  answered_at timestamptz not null default now(),
  unique (session_id, kind),
  check (asked = (wording_version is not null)),
  check (asked or not answer)
);
create table private.ielts_speaking_voice_consent_withdrawals(
  consent_id uuid primary key references private.ielts_speaking_consent_records(id),
  withdrawn_by uuid not null references public.users(id),
  withdrawn_at timestamptz not null default now()
);
create table private.ielts_speaking_mock_replays(
  session_id uuid not null references private.ielts_speaking_sessions(id),
  line_key text not null,
  replayed_at timestamptz not null default now(),
  primary key (session_id, line_key)
);
create table private.ielts_speaking_mock_answers(
  id uuid primary key,
  session_id uuid not null references private.ielts_speaking_sessions(id),
  line_key text not null,
  part integer not null check (part between 1 and 3),
  started_at timestamptz not null default now(),
  uploaded_at timestamptz,
  missing boolean not null default false,
  interrupted boolean not null default false,
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  duration_seconds numeric check (duration_seconds > 0 and duration_seconds <= 125),
  verified_at timestamptz,
  file_deleted_at timestamptz,
  unique (session_id, line_key),
  check (not (missing and verified_at is not null))
);
create table private.ielts_speaking_mock_parts(
  session_id uuid not null references private.ielts_speaking_sessions(id),
  part integer not null check (part between 1 and 3),
  clip_id uuid not null unique references private.ielts_speaking_clips(id),
  segments jsonb not null,
  joined_at timestamptz not null default now(),
  primary key (session_id, part)
);

alter table private.ielts_speaking_consent_wordings enable row level security;
alter table private.ielts_school_voice_agreements enable row level security;
alter table private.ielts_voice_improvement_legal_reviews enable row level security;
alter table private.ielts_speaking_mock_scripts enable row level security;
alter table private.ielts_speaking_mock_script_lines enable row level security;
alter table private.ielts_speaking_mock_audio enable row level security;
alter table private.ielts_speaking_mock_assignments enable row level security;
alter table private.ielts_speaking_mock_sittings enable row level security;
alter table private.ielts_speaking_consent_records enable row level security;
alter table private.ielts_speaking_voice_consent_withdrawals enable row level security;
alter table private.ielts_speaking_mock_replays enable row level security;
alter table private.ielts_speaking_mock_answers enable row level security;
alter table private.ielts_speaking_mock_parts enable row level security;

-- History is append-only. Only the listed state columns may be filled in, once.
create function private.guard_ielts_speaking_mock_history() returns trigger language plpgsql set search_path='' as $$
declare allowed text[]; o jsonb:=to_jsonb(old); n jsonb:=to_jsonb(new); c text; begin
 if tg_op='DELETE' then raise exception 'speaking_history_immutable'; end if;
 allowed:=case tg_table_name
  when 'ielts_speaking_mock_scripts' then array['released_by','released_at']
  when 'ielts_speaking_mock_audio' then array['approved_by','approved_at','rejected_by','rejected_at','review_note']
  when 'ielts_speaking_mock_assignments' then array['cancelled_by','cancelled_at']
  when 'ielts_speaking_mock_sittings' then array['checks','checks_passed_at','student_finished_at']
  when 'ielts_speaking_mock_answers' then array['uploaded_at','missing','interrupted','sha256','duration_seconds','verified_at','file_deleted_at']
  else array[]::text[] end;
 if (o-allowed) is distinct from (n-allowed) then raise exception 'speaking_history_immutable'; end if;
 foreach c in array allowed loop
   if o->c is not null and o->c<>'null'::jsonb and o->c is distinct from n->c
      and not (c in ('missing','interrupted') and o->>c='false') then raise exception 'speaking_history_immutable'; end if;
 end loop;
 return new;
end; $$;
create trigger speaking_mock_history before update or delete on private.ielts_speaking_consent_wordings for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_school_voice_agreements for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_voice_improvement_legal_reviews for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_scripts for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_script_lines for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_audio for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_assignments for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_sittings for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_consent_records for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_voice_consent_withdrawals for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_replays for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_answers for each row execute function private.guard_ielts_speaking_mock_history();
create trigger speaking_mock_history before update or delete on private.ielts_speaking_mock_parts for each row execute function private.guard_ielts_speaking_mock_history();

-- 6. Private storage ------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('ielts-speaking-examiner','ielts-speaking-examiner',false,2000000,array['audio/mpeg']),
 ('ielts-speaking-mock-answers','ielts-speaking-mock-answers',false,6000000,array['audio/wav'])
on conflict (id) do nothing;

-- 7. Helpers --------------------------------------------------------------------------------
create function private.ielts_speaking_mock_audio_key(p_body text, p_voice jsonb) returns text
language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(p_body,p_voice)::text,'UTF8')),'hex');
$$;

create function private.ielts_school_voice_agreement_current(p_school uuid, p_at timestamptz default now())
returns uuid language sql stable security definer set search_path='' as $$
 select a.id from private.ielts_school_voice_agreements a
 where p_school is not null and a.school_id=p_school and a.recorded_at<=p_at and a.active
   and not exists(select 1 from private.ielts_school_voice_agreements later where later.school_id=a.school_id and later.recorded_at>a.recorded_at and later.recorded_at<=p_at)
 order by a.recorded_at desc limit 1;
$$;

-- Server-only gate for any future improvement use. Today it is false for every recording,
-- because no legal review has been recorded (Bible 10.12).
create function private.ielts_voice_improvement_allowed(p_session uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_voice_improvement_legal_reviews)
 and exists(select 1 from private.ielts_speaking_consent_records c join private.ielts_speaking_sessions s on s.id=c.session_id
   where c.session_id=p_session and c.kind='voice_improvement' and c.asked and c.answer
   and not exists(select 1 from private.ielts_speaking_voice_consent_withdrawals w where w.consent_id=c.id)
   and private.ielts_school_voice_agreement_current(s.school_id) is not null);
$$;

create function private.ielts_speaking_mock_script_errors(p_lines jsonb, p_cue_card jsonb, p_voice jsonb)
returns text[] language plpgsql immutable set search_path='' as $$
declare e text[]:='{}'; l jsonb; i int:=0; prev_part int:=0; part int; kind text; secs int; prep_pos int; long_pos int;
  keys text[]:='{}'; part_secs int[]:=array[0,0,0]; begin
 if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 8 and 60 then return array['lines_count']; end if;
 if jsonb_typeof(p_voice)<>'object' or coalesce(p_voice->>'provider','')='' or coalesce(p_voice->>'model','')='' or coalesce(p_voice->>'voice','')='' then e:=array_append(e,'voice'::text); end if;
 if jsonb_typeof(p_cue_card)<>'object' or length(trim(coalesce(p_cue_card->>'topic','')))<5 or jsonb_typeof(p_cue_card->'points')<>'array'
    or jsonb_array_length(p_cue_card->'points') not between 2 and 5 then e:=array_append(e,'cue_card'::text); end if;
 for l in select value from jsonb_array_elements(p_lines) loop
   i:=i+1; part:=(l->>'part')::int; kind:=l->>'kind'; secs:=nullif(l->>'answer_seconds','')::int;
   if coalesce(l->>'key','') !~ '^[a-z0-9_.-]{1,40}$' or (l->>'key')=any(keys) then e:=array_append(e,('key:'||i)::text); end if;
   keys:=keys||(l->>'key');
   if part is null or part not between 0 and 4 or part<prev_part then e:=array_append(e,('part_order:'||i)::text); end if;
   prev_part:=coalesce(part,prev_part);
   if length(trim(coalesce(l->>'body','')))=0 or length(l->>'body')>600 or (l->>'body')~'[][<>{}]' then e:=array_append(e,('body:'||i)::text); end if;
   if kind='sound_check' and (i<>1 or part<>0) then e:=array_append(e,('sound_check:'||i)::text); end if;
   if i=1 and kind is distinct from 'sound_check' then e:=array_append(e,'sound_check_first'::text); end if;
   if kind in ('question','long_turn') then
     if part not between 1 and 3 then e:=array_append(e,('answer_part:'||i)::text); end if;
     if kind='long_turn' and (part<>2 or secs is distinct from 120) then e:=array_append(e,('long_turn:'||i)::text); end if;
     if kind='question' and (secs is null or secs not between 10 and 90) then e:=array_append(e,('answer_seconds:'||i)::text); end if;
     if part between 1 and 3 then part_secs[part]:=part_secs[part]+coalesce(secs,0); end if;
   elsif kind in ('sound_check','say','prepare') then
     if secs is not null then e:=array_append(e,('no_answer_expected:'||i)::text); end if;
   else e:=array_append(e,('kind:'||i)::text); end if;
   if coalesce((l->>'replay_allowed')::boolean,false) and not (kind='question' and part=1) then e:=array_append(e,('replay:'||i)::text); end if;
   if kind='prepare' then if part<>2 or prep_pos is not null then e:=array_append(e,('prepare:'||i)::text); end if; prep_pos:=i; end if;
   if kind='long_turn' then if long_pos is not null or prep_pos is null then e:=array_append(e,('long_turn_order:'||i)::text); end if; long_pos:=i; end if;
   if kind='question' and part=2 and long_pos is null then e:=array_append(e,('follow_up_order:'||i)::text); end if;
 end loop;
 if prep_pos is null or long_pos is null then e:=array_append(e,'part_2_required'::text); end if;
 if (select count(*) from jsonb_array_elements(p_lines) x where x->>'kind'='question' and (x->>'part')::int=1)<3 then e:=array_append(e,'part_1_questions'::text); end if;
 if (select count(*) from jsonb_array_elements(p_lines) x where x->>'kind'='question' and (x->>'part')::int=2)>2 then e:=array_append(e,'part_2_follow_ups'::text); end if;
 if (select count(*) from jsonb_array_elements(p_lines) x where x->>'kind'='question' and (x->>'part')::int=3)<3 then e:=array_append(e,'part_3_questions'::text); end if;
 if part_secs[1]>330 or part_secs[2]>330 or part_secs[3]>330 then e:=array_append(e,'part_too_long'::text); end if;
 return e;
exception when invalid_text_representation or numeric_value_out_of_range then return array['format'];
end; $$;

create function private.ielts_speaking_mock_actor_session(p_session uuid, p_lock boolean default true)
returns private.ielts_speaking_sessions language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; begin
 if p_lock then select * into s from private.ielts_speaking_sessions where id=p_session for update;
 else select * into s from private.ielts_speaking_sessions where id=p_session; end if;
 if not found or s.delivery_mode<>'recorded_examiner' or s.student_id is distinct from auth.uid()
    or not private.ielts_speaking_student_eligible(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 return s;
end; $$;

-- Students may play examiner lines only for a mock they are taking; the owner may play all.
create function private.ielts_speaking_examiner_audio_access(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (public.is_superadmin(auth.uid()) or exists(
   select 1 from private.ielts_speaking_mock_audio a
   join private.ielts_speaking_mock_script_lines l on l.audio_key=a.audio_key
   join private.ielts_speaking_mock_sittings m on m.script_id=l.script_id
   join private.ielts_speaking_sessions s on s.id=m.session_id
   where a.path=p_path and a.approved_at is not null and s.student_id=auth.uid() and s.status='in_progress'
     and private.ielts_speaking_student_eligible(auth.uid())));
$$;
create function private.ielts_speaking_mock_answer_upload(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.ielts_speaking_mock_answers a join private.ielts_speaking_sessions s on s.id=a.session_id
   where p_path=a.session_id::text||'/'||a.id::text||'.wav' and s.student_id=auth.uid() and s.status='in_progress'
     and a.uploaded_at is null and not a.missing and private.ielts_speaking_student_eligible(auth.uid()));
$$;
create policy "Speaking examiner audio for its mock" on storage.objects for select to authenticated
 using (bucket_id='ielts-speaking-examiner' and private.ielts_speaking_examiner_audio_access(name));
create policy "Speaking mock answer upload" on storage.objects for insert to authenticated
 with check (bucket_id='ielts-speaking-mock-answers' and private.ielts_speaking_mock_answer_upload(name));

-- 8. Owner: package approval and release, scripts, audio ---------------------------------
create function public.rpc_ielts_approve_speaking_mock_package(p_code text, p_content_hash text, p_review_record jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.ielts_speaking_packages; begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into p from private.ielts_speaking_packages where code=p_code for update;
 if not found or p.content->>'delivery_mode' is distinct from 'recorded_examiner' then raise exception 'speaking_mock_package_required'; end if;
 if p.content_hash<>p_content_hash or not coalesce(p_review_record @> '{"editorial":true,"task_design":true,"taxonomy":true,"difficulty_timing":true,"rights":true,"originality":true}',false)
    or length(trim(coalesce(p_review_record->>'notes','')))<10 then raise exception 'speaking_mock_review_required'; end if;
 if p.approved_at is null then update private.ielts_speaking_packages set approved_by=auth.uid(),approved_at=now(),review_record=p_review_record where code=p.code; end if;
 return jsonb_build_object('code',p.code,'content_hash',p.content_hash,'approved',true);
end; $$;

create function public.rpc_ielts_publish_speaking_mock(p_code text, p_content_hash text, p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.ielts_speaking_packages; begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into p from private.ielts_speaking_packages where code=p_code for update;
 if not found or p.content->>'delivery_mode' is distinct from 'recorded_examiner' then raise exception 'speaking_mock_package_required'; end if;
 if p.approved_at is null or p.content_hash<>p_content_hash or length(trim(coalesce(p_note,'')))<10 then raise exception 'speaking_mock_publication_requirements'; end if;
 if not exists(select 1 from private.ielts_speaking_mock_scripts s where s.package_code=p.code and s.content_hash=p.content_hash and s.released_at is not null) then raise exception 'speaking_mock_script_not_released'; end if;
 insert into private.ielts_speaking_releases(package_code,content_hash,authorized_by,acceptance_note) values(p.code,p.content_hash,auth.uid(),trim(p_note))
 on conflict (package_code) do nothing;
 return jsonb_build_object('code',p.code,'published',true);
end; $$;

create function public.rpc_ielts_speaking_mock_script(p_script_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ielts_speaking_mock_scripts; lines jsonb; begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_mock_scripts where id=p_script_id;
 if not found then raise exception 'speaking_mock_script_not_found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('position',l.position,'key',l.key,'part',l.part,'kind',l.kind,'body',l.body,
   'answer_seconds',l.answer_seconds,'replay_allowed',l.replay_allowed,'audio_key',l.audio_key,
   'approved_audio',(select jsonb_build_object('id',a.id,'sha256',a.sha256,'duration_seconds',a.duration_seconds,'approved_at',a.approved_at)
      from private.ielts_speaking_mock_audio a where a.audio_key=l.audio_key and a.approved_at is not null),
   'candidates',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'path',a.path,'sha256',a.sha256,'duration_seconds',a.duration_seconds,'rejected',a.rejected_at is not null) order by a.produced_at),'[]'::jsonb)
      from private.ielts_speaking_mock_audio a where a.audio_key=l.audio_key and a.approved_at is null)) order by l.position),'[]'::jsonb) into lines
 from private.ielts_speaking_mock_script_lines l where l.script_id=s.id;
 return jsonb_build_object('id',s.id,'package_code',s.package_code,'content_hash',s.content_hash,'version',s.version,'voice',s.voice,'cue_card',s.cue_card,
   'released_at',s.released_at,'lines',lines,
   -- Exactly what still needs paid generation: lines whose text and voice have no approved audio yet.
   'needs_audio',(select jsonb_build_object('lines',count(*),'characters',coalesce(sum(n.chars),0))
      from (select distinct l.audio_key, length(l.body) chars from private.ielts_speaking_mock_script_lines l where l.script_id=s.id
        and not exists(select 1 from private.ielts_speaking_mock_audio a where a.audio_key=l.audio_key and a.approved_at is not null)) n));
end; $$;

create function public.rpc_ielts_create_speaking_mock_script(p_script_id uuid, p_package_code text, p_content_hash text, p_voice jsonb, p_cue_card jsonb, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.ielts_speaking_packages; errors text[]; begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 if exists(select 1 from private.ielts_speaking_mock_scripts where id=p_script_id) then
   if not exists(select 1 from private.ielts_speaking_mock_scripts where id=p_script_id and package_code=p_package_code and content_hash=p_content_hash and voice=p_voice and cue_card=p_cue_card) then raise exception 'speaking_mock_script_conflict'; end if;
   return public.rpc_ielts_speaking_mock_script(p_script_id);
 end if;
 select * into p from private.ielts_speaking_packages where code=p_package_code for update;
 if not found or p.content->>'delivery_mode' is distinct from 'recorded_examiner' then raise exception 'speaking_mock_package_required'; end if;
 if p.content_hash<>p_content_hash then raise exception 'speaking_mock_package_changed'; end if;
 errors:=private.ielts_speaking_mock_script_errors(p_lines,p_cue_card,p_voice);
 if cardinality(errors)>0 then raise exception 'speaking_mock_script_invalid: %',array_to_string(errors,','); end if;
 insert into private.ielts_speaking_mock_scripts(id,package_code,content_hash,version,voice,cue_card,created_by)
 values(p_script_id,p.code,p.content_hash,coalesce((select max(version) from private.ielts_speaking_mock_scripts where package_code=p.code),0)+1,p_voice,p_cue_card,auth.uid());
 insert into private.ielts_speaking_mock_script_lines(script_id,position,key,part,kind,body,answer_seconds,replay_allowed,audio_key)
 select p_script_id,x.n::int,x.v->>'key',(x.v->>'part')::int,x.v->>'kind',x.v->>'body',nullif(x.v->>'answer_seconds','')::int,
   coalesce((x.v->>'replay_allowed')::boolean,false),private.ielts_speaking_mock_audio_key(x.v->>'body',p_voice)
 from jsonb_array_elements(p_lines) with ordinality x(v,n);
 return public.rpc_ielts_speaking_mock_script(p_script_id);
end; $$;

-- Server-only: the import step stores the file in private storage, then registers it.
create function public.rpc_ielts_register_speaking_mock_audio(p_audio_id uuid, p_audio_key text, p_path text, p_sha256 text, p_duration numeric, p_bytes bigint, p_provider text, p_provider_task_id text, p_rights_basis text)
returns uuid language plpgsql security definer set search_path='' as $$
declare l private.ielts_speaking_mock_script_lines; v jsonb; begin
 if exists(select 1 from private.ielts_speaking_mock_audio where id=p_audio_id) then
   if not exists(select 1 from private.ielts_speaking_mock_audio where id=p_audio_id and audio_key=p_audio_key and path=p_path and sha256=p_sha256) then raise exception 'speaking_mock_audio_conflict'; end if;
   return p_audio_id;
 end if;
 select l2.* into l from private.ielts_speaking_mock_script_lines l2 where l2.audio_key=p_audio_key limit 1;
 if not found then raise exception 'speaking_mock_audio_line_not_found'; end if;
 select s.voice into v from private.ielts_speaking_mock_scripts s where s.id=l.script_id;
 if p_path<>p_audio_id::text||'.mp3' or not exists(select 1 from storage.objects o where o.bucket_id='ielts-speaking-examiner' and o.name=p_path
    and o.metadata->>'mimetype'='audio/mpeg' and coalesce((o.metadata->>'size')::bigint,-1)=p_bytes) then raise exception 'speaking_mock_audio_not_stored'; end if;
 insert into private.ielts_speaking_mock_audio(id,audio_key,body,voice,path,sha256,duration_seconds,bytes,mime_type,provider,provider_task_id,rights_basis)
 values(p_audio_id,p_audio_key,l.body,v,p_path,p_sha256,p_duration,p_bytes,'audio/mpeg',p_provider,p_provider_task_id,p_rights_basis);
 return p_audio_id;
end; $$;

-- A named person listens and approves the exact file. AI or a successful generation never does.
create function public.rpc_ielts_review_speaking_mock_audio(p_audio_id uuid, p_sha256 text, p_approve boolean, p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.ielts_speaking_mock_audio; s uuid; begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_speaking_mock_audio where id=p_audio_id for update;
 if not found or a.sha256<>p_sha256 then raise exception 'speaking_mock_audio_changed'; end if;
 if a.approved_at is not null or a.rejected_at is not null then
   if (a.approved_at is not null) is distinct from p_approve then raise exception 'speaking_mock_audio_already_reviewed'; end if;
 elsif p_approve then
   if exists(select 1 from private.ielts_speaking_mock_audio where audio_key=a.audio_key and approved_at is not null) then raise exception 'speaking_mock_audio_already_approved'; end if;
   update private.ielts_speaking_mock_audio set approved_by=auth.uid(),approved_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'') where id=a.id;
 else
   if length(trim(coalesce(p_note,'')))<3 then raise exception 'speaking_mock_rejection_note_required'; end if;
   update private.ielts_speaking_mock_audio set rejected_by=auth.uid(),rejected_at=now(),review_note=trim(p_note) where id=a.id;
 end if;
 select l.script_id into s from private.ielts_speaking_mock_script_lines l join private.ielts_speaking_mock_scripts sc on sc.id=l.script_id
 where l.audio_key=a.audio_key order by sc.created_at desc limit 1;
 return public.rpc_ielts_speaking_mock_script(s);
end; $$;

create function public.rpc_ielts_release_speaking_mock_script(p_script_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_mock_scripts; begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into s from private.ielts_speaking_mock_scripts where id=p_script_id for update;
 if not found then raise exception 'speaking_mock_script_not_found'; end if;
 if s.released_at is null then
   if not exists(select 1 from private.ielts_speaking_packages p where p.code=s.package_code and p.content_hash=s.content_hash and p.approved_at is not null) then raise exception 'speaking_mock_package_not_approved'; end if;
   if exists(select 1 from private.ielts_speaking_mock_script_lines l where l.script_id=s.id and not exists(select 1 from private.ielts_speaking_mock_audio a where a.audio_key=l.audio_key and a.approved_at is not null)) then raise exception 'speaking_mock_audio_not_approved'; end if;
   update private.ielts_speaking_mock_scripts set released_by=auth.uid(),released_at=now() where id=s.id;
 end if;
 return public.rpc_ielts_speaking_mock_script(s.id);
end; $$;

-- School admin or owner records that parents or guardians agreed (or withdraws that record).
create function public.rpc_ielts_set_school_voice_agreement(p_school_id uuid, p_active boolean, p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_school_id is null or not (public.is_superadmin(auth.uid()) or exists(select 1 from public.school_members m
   where m.user_id=auth.uid() and m.school_id=p_school_id and m.status='active' and m.role_in_school in ('school_admin','admin','owner'))) then
   raise exception using errcode='42501',message='not_authorized'; end if;
 if p_active is null or length(trim(coalesce(p_note,''))) not between 10 and 1000 then raise exception 'voice_agreement_note_required'; end if;
 insert into private.ielts_school_voice_agreements(school_id,active,note,recorded_by) values(p_school_id,p_active,trim(p_note),auth.uid());
 return jsonb_build_object('school_id',p_school_id,'active',private.ielts_school_voice_agreement_current(p_school_id) is not null);
end; $$;

create function public.rpc_ielts_record_voice_legal_review(p_jurisdictions text[], p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_superadmin(auth.uid()) then raise exception using errcode='42501',message='not_authorized'; end if;
 insert into private.ielts_voice_improvement_legal_reviews(jurisdictions,note,recorded_by) values(p_jurisdictions,trim(coalesce(p_note,'')),auth.uid());
 return jsonb_build_object('recorded',true);
end; $$;

-- 9. Teachers: assign, cancel, list ---------------------------------------------------------
create function public.rpc_ielts_assign_speaking_mock(p_package_code text, p_assignments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.ielts_speaking_packages; sc private.ielts_speaking_mock_scripts; item jsonb; stu uuid; aid uuid; made int:=0; existing private.ielts_speaking_mock_assignments; begin
 if auth.uid() is null then raise exception using errcode='42501',message='not_authorized'; end if;
 if jsonb_typeof(p_assignments)<>'array' or jsonb_array_length(p_assignments) not between 1 and 60 then raise exception 'speaking_mock_assignment_list'; end if;
 select * into p from private.ielts_speaking_packages where code=p_package_code;
 if not found or p.content->>'delivery_mode' is distinct from 'recorded_examiner' or p.approved_at is null then raise exception 'speaking_mock_package_not_approved'; end if;
 select * into sc from private.ielts_speaking_mock_scripts where package_code=p.code and content_hash=p.content_hash and released_at is not null order by version desc limit 1;
 if not found then raise exception 'speaking_mock_script_not_released'; end if;
 for item in select value from jsonb_array_elements(p_assignments) loop
   stu:=(item->>'student_id')::uuid; aid:=(item->>'assignment_id')::uuid;
   if stu is null or aid is null then raise exception 'speaking_mock_assignment_list'; end if;
   if not private.can_review_ielts_speaking_student(stu) then raise exception using errcode='42501',message='not_authorized'; end if;
   if stu<>p.pilot_student and not exists(select 1 from private.ielts_speaking_releases r where r.package_code=p.code and r.content_hash=p.content_hash) then raise exception 'speaking_mock_not_published'; end if;
   perform pg_advisory_xact_lock(hashtextextended('speaking-mock:'||stu::text,0));
   select * into existing from private.ielts_speaking_mock_assignments where id=aid;
   if found then
     if existing.student_id<>stu or existing.package_code<>p.code then raise exception 'speaking_mock_assignment_conflict'; end if;
     continue;
   end if;
   -- One open attempt per student and mock: a new one only after the last was cancelled or finished.
   if exists(select 1 from private.ielts_speaking_mock_assignments a where a.student_id=stu and a.package_code=p.code and a.cancelled_at is null
      and not exists(select 1 from private.ielts_speaking_mock_sittings m join private.ielts_speaking_sessions s on s.id=m.session_id
        where m.assignment_id=a.id and (s.status='submitted' or m.student_finished_at is not null))) then continue; end if;
   insert into private.ielts_speaking_mock_assignments(id,school_id,student_id,teacher_id,package_code,script_id)
   values(aid,(select school_id from public.users where id=stu),stu,auth.uid(),p.code,sc.id);
   made:=made+1;
 end loop;
 return jsonb_build_object('assigned',made,'script_version',sc.version);
end; $$;

create function public.rpc_ielts_cancel_speaking_mock_assignment(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a private.ielts_speaking_mock_assignments; begin
 select * into a from private.ielts_speaking_mock_assignments where id=p_assignment_id for update;
 if not found or not private.can_review_ielts_speaking_student(a.student_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 if exists(select 1 from private.ielts_speaking_mock_sittings where assignment_id=a.id) then raise exception 'speaking_mock_already_started'; end if;
 if a.cancelled_at is null then update private.ielts_speaking_mock_assignments set cancelled_by=auth.uid(),cancelled_at=now() where id=a.id; end if;
 return jsonb_build_object('cancelled',true);
end; $$;

create function public.rpc_ielts_speaking_mock_teacher_list(p_student_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_review_ielts_speaking_student(p_student_id) then raise exception using errcode='42501',message='not_authorized'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('assignment_id',a.id,'package_code',a.package_code,'title',p.content->>'title','assigned_at',a.created_at,
   'assigned_by',(select username from public.users where id=a.teacher_id),'cancelled_at',a.cancelled_at,'session_id',m.session_id,
   'started_at',s.created_at,'finished_at',m.student_finished_at,'status',s.status,'reviewed',exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id),
   'interrupted_answers',(select count(*) from private.ielts_speaking_mock_answers x where x.session_id=s.id and (x.interrupted or x.missing))) order by a.created_at desc),'[]'::jsonb)
  from private.ielts_speaking_mock_assignments a join private.ielts_speaking_packages p on p.code=a.package_code
  left join private.ielts_speaking_mock_sittings m on m.assignment_id=a.id left join private.ielts_speaking_sessions s on s.id=m.session_id
  where a.student_id=p_student_id);
end; $$;

-- 10. Students: home, start, sitting, checks, answers, finish ----------------------------
create function public.rpc_ielts_speaking_mock_home()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); sch uuid; begin
 if me is null or not private.ielts_speaking_student_eligible(me) then return jsonb_build_object('available',false); end if;
 select school_id into sch from public.users where id=me;
 return jsonb_build_object('available',true,
  'recording_wording',(select jsonb_build_object('version',w.version,'body',w.body) from private.ielts_speaking_consent_wordings w where w.version='mock-recording-v1'),
  'voice_wording',case when private.ielts_school_voice_agreement_current(sch) is not null then
     (select jsonb_build_object('version',w.version,'body',w.body) from private.ielts_speaking_consent_wordings w where w.version='mock-voice-v1') end,
  'mocks',(select coalesce(jsonb_agg(jsonb_build_object('assignment_id',a.id,'title',p.content->>'title','assigned_at',a.created_at,
     'session_id',m.session_id,'state',case when s.id is null then 'ready' when s.status='submitted' and exists(select 1 from private.ielts_speaking_reviews r where r.session_id=s.id and r.teacher_confirmed) then 'reviewed'
        when s.status='submitted' or m.student_finished_at is not null then 'finished' else 'in_progress' end) order by a.created_at desc),'[]'::jsonb)
   from private.ielts_speaking_mock_assignments a join private.ielts_speaking_packages p on p.code=a.package_code
   left join private.ielts_speaking_mock_sittings m on m.assignment_id=a.id left join private.ielts_speaking_sessions s on s.id=m.session_id
   where a.student_id=me and a.cancelled_at is null));
end; $$;

create function public.rpc_ielts_speaking_mock_sitting(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; m private.ielts_speaking_mock_sittings; sc private.ielts_speaking_mock_scripts; begin
 s:=private.ielts_speaking_mock_actor_session(p_session_id,false);
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 select * into sc from private.ielts_speaking_mock_scripts where id=m.script_id;
 -- Questions are heard, not shown: no line text is sent to the student, only the Part 2 cue card.
 return jsonb_build_object('session_id',s.id,'status',s.status,'server_now',now(),'title',s.package_snapshot->>'title',
  'checks_passed',m.checks_passed_at is not null,'finished',m.student_finished_at is not null,
  'preparation_started_at',s.preparation_started_at,'cue_card',sc.cue_card,
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('key',l.key,'position',l.position,'part',l.part,'kind',l.kind,'answer_seconds',l.answer_seconds,
      'replay_allowed',l.replay_allowed,'replayed',exists(select 1 from private.ielts_speaking_mock_replays r where r.session_id=s.id and r.line_key=l.key),
      'audio_path',a.path,'audio_seconds',a.duration_seconds) order by l.position),'[]'::jsonb)
    from private.ielts_speaking_mock_script_lines l left join private.ielts_speaking_mock_audio a on a.audio_key=l.audio_key and a.approved_at is not null where l.script_id=sc.id),
  'answers',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'line_key',x.line_key,'part',x.part,'started_at',x.started_at,
      'uploaded',x.uploaded_at is not null,'missing',x.missing,'interrupted',x.interrupted) order by x.started_at),'[]'::jsonb)
    from private.ielts_speaking_mock_answers x where x.session_id=s.id));
end; $$;

create function public.rpc_ielts_start_speaking_mock(p_assignment_id uuid, p_session_id uuid, p_recording_consent boolean, p_recording_wording text, p_voice_consent boolean, p_voice_wording text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); a private.ielts_speaking_mock_assignments; p private.ielts_speaking_packages; m private.ielts_speaking_mock_sittings;
  agreement uuid; w private.ielts_speaking_consent_wordings; begin
 if me is null or not private.ielts_speaking_student_eligible(me) then raise exception using errcode='42501',message='not_authorized'; end if;
 select * into a from private.ielts_speaking_mock_assignments where id=p_assignment_id;
 if not found or a.student_id<>me then raise exception using errcode='42501',message='not_authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended('speaking-mock:'||me::text,0));
 select * into m from private.ielts_speaking_mock_sittings where assignment_id=a.id;
 if found then
   if m.session_id<>p_session_id then raise exception 'speaking_mock_already_started'; end if;
   return public.rpc_ielts_speaking_mock_sitting(m.session_id);
 end if;
 if a.cancelled_at is not null then raise exception 'speaking_mock_assignment_cancelled'; end if;
 if p_session_id is null or exists(select 1 from private.ielts_speaking_sessions where id=p_session_id) then raise exception 'speaking_session_conflict'; end if;
 select * into w from private.ielts_speaking_consent_wordings where version=p_recording_wording and kind='recording';
 if p_recording_consent is distinct from true or not found then raise exception 'speaking_recording_consent_required'; end if;
 select * into p from private.ielts_speaking_packages where code=a.package_code;
 if p.approved_at is null or not exists(select 1 from private.ielts_speaking_mock_scripts sc where sc.id=a.script_id and sc.released_at is not null and sc.content_hash=p.content_hash) then raise exception 'speaking_mock_not_available'; end if;
 agreement:=private.ielts_school_voice_agreement_current(a.school_id);
 if agreement is not null and (p_voice_consent is null or not exists(select 1 from private.ielts_speaking_consent_wordings x where x.version=p_voice_wording and x.kind='voice_improvement')) then raise exception 'speaking_voice_consent_answer_required'; end if;
 insert into private.ielts_speaking_sessions(id,student_id,teacher_id,school_id,package_code,content_hash,package_snapshot,evidence_kind,recording_consent,delivery_mode)
 values(p_session_id,me,a.teacher_id,a.school_id,p.code,p.content_hash,p.content,'practice_mock',true,'recorded_examiner');
 insert into private.ielts_speaking_mock_sittings(session_id,assignment_id,script_id) values(p_session_id,a.id,a.script_id);
 insert into private.ielts_speaking_consent_records(session_id,kind,asked,answer,wording_version,wording_sha256,answered_by)
 values(p_session_id,'recording',true,true,w.version,w.sha256,me);
 if agreement is null then
   -- Not asked: no school record of parents' agreement, so the answer is No.
   insert into private.ielts_speaking_consent_records(session_id,kind,asked,answer,answered_by) values(p_session_id,'voice_improvement',false,false,me);
 else
   insert into private.ielts_speaking_consent_records(session_id,kind,asked,answer,wording_version,wording_sha256,school_agreement_id,answered_by)
   select p_session_id,'voice_improvement',true,p_voice_consent,x.version,x.sha256,agreement,me from private.ielts_speaking_consent_wordings x where x.version=p_voice_wording;
 end if;
 return public.rpc_ielts_speaking_mock_sitting(p_session_id);
end; $$;

create function public.rpc_ielts_withdraw_speaking_voice_consent(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ielts_speaking_consent_records; s private.ielts_speaking_sessions; begin
 select * into s from private.ielts_speaking_sessions where id=p_session_id;
 if not found or not (s.student_id=auth.uid() or public.is_superadmin(auth.uid()) or exists(select 1 from public.school_members m
    where m.user_id=auth.uid() and m.school_id=s.school_id and m.status='active' and m.role_in_school in ('school_admin','admin','owner'))) then
   raise exception using errcode='42501',message='not_authorized'; end if;
 select * into c from private.ielts_speaking_consent_records where session_id=s.id and kind='voice_improvement';
 if found and c.answer then insert into private.ielts_speaking_voice_consent_withdrawals(consent_id,withdrawn_by) values(c.id,auth.uid()) on conflict do nothing; end if;
 return jsonb_build_object('voice_improvement',false);
end; $$;

-- Sound, room and microphone checks are measured on the device and recorded as reported.
create function public.rpc_ielts_speaking_mock_checks(p_session_id uuid, p_checks jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; begin
 s:=private.ielts_speaking_mock_actor_session(p_session_id);
 if s.status<>'in_progress' then raise exception 'speaking_mock_closed'; end if;
 if jsonb_typeof(p_checks)<>'object' or length(p_checks::text)>2000 or not coalesce(p_checks @> '{"sound":true,"room":true,"microphone":true}',false) then raise exception 'speaking_mock_checks_required'; end if;
 update private.ielts_speaking_mock_sittings set checks=p_checks,checks_passed_at=now() where session_id=s.id and checks_passed_at is null;
 return public.rpc_ielts_speaking_mock_sitting(s.id);
end; $$;

create function public.rpc_ielts_speaking_mock_replay(p_session_id uuid, p_line_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; m private.ielts_speaking_mock_sittings; begin
 s:=private.ielts_speaking_mock_actor_session(p_session_id);
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 if s.status<>'in_progress' or m.student_finished_at is not null then raise exception 'speaking_mock_closed'; end if;
 if not exists(select 1 from private.ielts_speaking_mock_script_lines l where l.script_id=m.script_id and l.key=p_line_key and l.replay_allowed) then raise exception 'speaking_mock_replay_not_allowed'; end if;
 if exists(select 1 from private.ielts_speaking_mock_replays where session_id=s.id and line_key=p_line_key) then raise exception 'speaking_mock_replay_used'; end if;
 if exists(select 1 from private.ielts_speaking_mock_answers where session_id=s.id and line_key=p_line_key and (uploaded_at is not null or missing)) then raise exception 'speaking_mock_replay_not_allowed'; end if;
 insert into private.ielts_speaking_mock_replays(session_id,line_key) values(s.id,p_line_key);
 return public.rpc_ielts_speaking_mock_sitting(s.id);
end; $$;

-- Part 2 preparation: the one minute starts on the server and cannot be reset by refresh.
create function public.rpc_ielts_speaking_mock_prepare(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; m private.ielts_speaking_mock_sittings; begin
 s:=private.ielts_speaking_mock_actor_session(p_session_id);
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 if s.status<>'in_progress' or m.student_finished_at is not null then raise exception 'speaking_mock_closed'; end if;
 if exists(select 1 from private.ielts_speaking_mock_script_lines l where l.script_id=m.script_id and l.part=1 and l.kind='question'
    and not exists(select 1 from private.ielts_speaking_mock_answers x where x.session_id=s.id and x.line_key=l.key)) then raise exception 'speaking_previous_part_required'; end if;
 update private.ielts_speaking_sessions set preparation_started_at=now() where id=s.id and preparation_started_at is null;
 return public.rpc_ielts_speaking_mock_sitting(s.id);
end; $$;

create function public.rpc_ielts_speaking_mock_begin_answer(p_session_id uuid, p_line_key text, p_answer_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; m private.ielts_speaking_mock_sittings; l private.ielts_speaking_mock_script_lines; x private.ielts_speaking_mock_answers; begin
 s:=private.ielts_speaking_mock_actor_session(p_session_id);
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 select * into x from private.ielts_speaking_mock_answers where id=p_answer_id;
 if found then
   if x.session_id<>s.id or x.line_key<>p_line_key then raise exception 'speaking_mock_answer_conflict'; end if;
   return public.rpc_ielts_speaking_mock_sitting(s.id);
 end if;
 if s.status<>'in_progress' or m.student_finished_at is not null then raise exception 'speaking_mock_closed'; end if;
 if m.checks_passed_at is null then raise exception 'speaking_mock_checks_required'; end if;
 select * into l from private.ielts_speaking_mock_script_lines where script_id=m.script_id and key=p_line_key and kind in ('question','long_turn');
 if not found then raise exception 'speaking_mock_line_not_answerable'; end if;
 if exists(select 1 from private.ielts_speaking_mock_answers where session_id=s.id and line_key=l.key) then raise exception 'speaking_mock_answer_already_started'; end if;
 -- Lines run in order; nothing is answered twice and nothing is skipped silently.
 if exists(select 1 from private.ielts_speaking_mock_script_lines e where e.script_id=m.script_id and e.position<l.position and e.kind in ('question','long_turn')
    and not exists(select 1 from private.ielts_speaking_mock_answers y where y.session_id=s.id and y.line_key=e.key)) then raise exception 'speaking_mock_out_of_order'; end if;
 if l.kind='long_turn' and (s.preparation_started_at is null or s.preparation_started_at>now()-interval '60 seconds') then raise exception 'speaking_preparation_required'; end if;
 if l.part=3 and s.preparation_started_at is null then raise exception 'speaking_previous_part_required'; end if;
 insert into private.ielts_speaking_mock_answers(id,session_id,line_key,part) values(p_answer_id,s.id,l.key,l.part);
 return public.rpc_ielts_speaking_mock_sitting(s.id);
end; $$;

-- The device reports that an answer's file is uploaded, or that no audio survived.
create function public.rpc_ielts_speaking_mock_answer_saved(p_session_id uuid, p_answer_id uuid, p_interrupted boolean, p_missing boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; x private.ielts_speaking_mock_answers; begin
 s:=private.ielts_speaking_mock_actor_session(p_session_id);
 select * into x from private.ielts_speaking_mock_answers where id=p_answer_id and session_id=s.id for update;
 if not found then raise exception 'speaking_mock_answer_not_found'; end if;
 if x.uploaded_at is not null or x.missing then
   if x.missing is distinct from coalesce(p_missing,false) then raise exception 'speaking_mock_answer_conflict'; end if;
   return public.rpc_ielts_speaking_mock_sitting(s.id);
 end if;
 if s.status<>'in_progress' then raise exception 'speaking_mock_closed'; end if;
 if coalesce(p_missing,false) then
   update private.ielts_speaking_mock_answers set missing=true,interrupted=true where id=x.id;
 else
   if not exists(select 1 from storage.objects o where o.bucket_id='ielts-speaking-mock-answers' and o.name=s.id::text||'/'||x.id::text||'.wav'
      and coalesce((o.metadata->>'size')::bigint,0) between 46 and 6000000 and o.metadata->>'mimetype'='audio/wav') then raise exception 'speaking_audio_not_uploaded'; end if;
   update private.ielts_speaking_mock_answers set uploaded_at=now(),interrupted=coalesce(p_interrupted,false) where id=x.id;
 end if;
 return public.rpc_ielts_speaking_mock_sitting(s.id);
end; $$;

create function public.rpc_ielts_speaking_mock_finish(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; m private.ielts_speaking_mock_sittings; begin
 s:=private.ielts_speaking_mock_actor_session(p_session_id);
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 if m.student_finished_at is null then
   if exists(select 1 from private.ielts_speaking_mock_script_lines l where l.script_id=m.script_id and l.kind in ('question','long_turn')
      and not exists(select 1 from private.ielts_speaking_mock_answers x where x.session_id=s.id and x.line_key=l.key and (x.uploaded_at is not null or x.missing))) then
     raise exception 'speaking_mock_answers_pending'; end if;
   update private.ielts_speaking_mock_sittings set student_finished_at=now() where session_id=s.id;
 end if;
 return public.rpc_ielts_speaking_mock_sitting(s.id);
end; $$;

-- 11. Server-only steps: verify answers, attach joined parts, delete working copies, submit
create function public.rpc_ielts_speaking_mock_verify_answer(p_answer_id uuid, p_sha256 text, p_duration numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x private.ielts_speaking_mock_answers; lim int; begin
 select * into x from private.ielts_speaking_mock_answers where id=p_answer_id for update;
 if not found or x.uploaded_at is null or x.missing then raise exception 'speaking_mock_answer_not_uploaded'; end if;
 if x.verified_at is not null then
   if (x.sha256,x.duration_seconds) is distinct from (p_sha256,p_duration) then raise exception 'speaking_mock_answer_conflict'; end if;
   return jsonb_build_object('verified',true);
 end if;
 select l.answer_seconds into lim from private.ielts_speaking_mock_sittings m join private.ielts_speaking_mock_script_lines l on l.script_id=m.script_id and l.key=x.line_key where m.session_id=x.session_id;
 if p_sha256 !~ '^[a-f0-9]{64}$' or p_duration is null or p_duration<=0 or p_duration>lim+3 then raise exception 'speaking_mock_answer_invalid'; end if;
 update private.ielts_speaking_mock_answers set sha256=p_sha256,duration_seconds=p_duration,verified_at=now() where id=x.id;
 return jsonb_build_object('verified',true);
end; $$;

create function public.rpc_ielts_speaking_mock_attach_part(p_session_id uuid, p_part integer, p_clip_id uuid, p_sha256 text, p_duration numeric, p_segments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; m private.ielts_speaking_mock_sittings; mp private.ielts_speaking_mock_parts; path text; expected text[]; got text[]; seg jsonb; last_end numeric:=0; begin
 select * into s from private.ielts_speaking_sessions where id=p_session_id for update;
 if not found or s.delivery_mode<>'recorded_examiner' then raise exception 'speaking_mock_session_required'; end if;
 select * into mp from private.ielts_speaking_mock_parts where session_id=s.id and part=p_part;
 if found then
   if mp.clip_id<>p_clip_id then raise exception 'speaking_clip_conflict'; end if;
   return jsonb_build_object('attached',true);
 end if;
 if s.status<>'in_progress' then raise exception 'speaking_already_submitted'; end if;
 select * into m from private.ielts_speaking_mock_sittings where session_id=s.id;
 if p_part not between 1 and 3 or (p_part>1 and not exists(select 1 from private.ielts_speaking_mock_parts where session_id=s.id and part=p_part-1)) then raise exception 'speaking_previous_part_required'; end if;
 if exists(select 1 from private.ielts_speaking_mock_script_lines l where l.script_id=m.script_id and l.part=p_part and l.kind in ('question','long_turn')
    and not exists(select 1 from private.ielts_speaking_mock_answers x where x.session_id=s.id and x.line_key=l.key and (x.verified_at is not null or x.missing))) then raise exception 'speaking_mock_part_not_ready'; end if;
 select array_agg(x.line_key order by l.position) into expected from private.ielts_speaking_mock_answers x
   join private.ielts_speaking_mock_script_lines l on l.script_id=m.script_id and l.key=x.line_key where x.session_id=s.id and x.part=p_part and x.verified_at is not null;
 if expected is null then raise exception 'speaking_mock_part_has_no_audio'; end if;
 if jsonb_typeof(p_segments)<>'array' then raise exception 'speaking_mock_segments_invalid'; end if;
 for seg in select value from jsonb_array_elements(p_segments) loop
   if jsonb_typeof(seg)<>'object' or seg->>'line_key' is null or seg->>'start' is null or seg->>'end' is null
      or (seg->>'start')::numeric<last_end-0.01 or (seg->>'end')::numeric<=(seg->>'start')::numeric or (seg->>'end')::numeric>p_duration+0.5 then raise exception 'speaking_mock_segments_invalid'; end if;
   last_end:=(seg->>'end')::numeric; got:=coalesce(got,'{}')||(seg->>'line_key');
 end loop;
 if got is distinct from expected then raise exception 'speaking_mock_segments_invalid'; end if;
 path:=s.id::text||'/'||p_part::text||'/'||p_clip_id::text||'.wav';
 if not exists(select 1 from storage.objects o where o.bucket_id='ielts-speaking-pilot' and o.name=path and coalesce((o.metadata->>'size')::bigint,0) between 46 and 12000000 and o.metadata->>'mimetype'='audio/wav') then raise exception 'speaking_audio_not_uploaded'; end if;
 -- The same receipt and clip rows as an interview, so the existing pipeline reads them unchanged.
 insert into private.ielts_speaking_audio_receipts(clip_id,session_id,part,sha256,duration_seconds) values(p_clip_id,s.id,p_part,p_sha256,p_duration);
 insert into private.ielts_speaking_clips(id,session_id,part,path,sha256,duration_seconds,mime_type,interrupted)
 values(p_clip_id,s.id,p_part,path,p_sha256,p_duration,'audio/wav',exists(select 1 from private.ielts_speaking_mock_answers x where x.session_id=s.id and x.part=p_part and (x.interrupted or x.missing)));
 insert into private.ielts_speaking_mock_parts(session_id,part,clip_id,segments) values(s.id,p_part,p_clip_id,p_segments);
 return jsonb_build_object('attached',true);
exception when invalid_text_representation then raise exception 'speaking_mock_segments_invalid';
end; $$;

create function public.rpc_ielts_speaking_mock_answer_file_deleted(p_answer_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update private.ielts_speaking_mock_answers x set file_deleted_at=now() where x.id=p_answer_id and x.file_deleted_at is null and x.verified_at is not null
   and exists(select 1 from private.ielts_speaking_mock_parts p where p.session_id=x.session_id and p.part=x.part);
 if not found and not exists(select 1 from private.ielts_speaking_mock_answers where id=p_answer_id and file_deleted_at is not null) then raise exception 'speaking_mock_part_not_joined'; end if;
end; $$;

create function public.rpc_ielts_speaking_mock_submit(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.ielts_speaking_sessions; begin
 select * into s from private.ielts_speaking_sessions where id=p_session_id for update;
 if not found or s.delivery_mode<>'recorded_examiner' then raise exception 'speaking_mock_session_required'; end if;
 if s.status='submitted' then return jsonb_build_object('submitted',true); end if;
 if not exists(select 1 from private.ielts_speaking_mock_sittings where session_id=s.id and student_finished_at is not null) then raise exception 'speaking_mock_not_finished'; end if;
 if (select count(*) from private.ielts_speaking_mock_parts where session_id=s.id)<>3 then raise exception 'speaking_three_parts_required'; end if;
 update private.ielts_speaking_sessions set status='submitted',submitted_at=now() where id=s.id;
 return jsonb_build_object('submitted',true);
end; $$;

-- 12. Privileges ----------------------------------------------------------------------------
revoke all on function private.guard_ielts_speaking_mock_history() from public,anon,authenticated,service_role;
revoke all on function private.ielts_speaking_mock_audio_key(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ielts_school_voice_agreement_current(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function private.ielts_voice_improvement_allowed(uuid) from public,anon,authenticated,service_role;
revoke all on function private.ielts_speaking_mock_script_errors(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.ielts_speaking_mock_actor_session(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function private.ielts_speaking_examiner_audio_access(text) from public,anon,service_role;
revoke all on function private.ielts_speaking_mock_answer_upload(text) from public,anon,service_role;

revoke all on function public.rpc_ielts_approve_speaking_mock_package(text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_publish_speaking_mock(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_script(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_create_speaking_mock_script(uuid,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_register_speaking_mock_audio(uuid,text,text,text,numeric,bigint,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_review_speaking_mock_audio(uuid,text,boolean,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_release_speaking_mock_script(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_set_school_voice_agreement(uuid,boolean,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_record_voice_legal_review(text[],text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_assign_speaking_mock(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_cancel_speaking_mock_assignment(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_teacher_list(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_home() from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_sitting(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_start_speaking_mock(uuid,uuid,boolean,text,boolean,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_withdraw_speaking_voice_consent(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_checks(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_replay(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_prepare(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_begin_answer(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_answer_saved(uuid,uuid,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_finish(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_verify_answer(uuid,text,numeric) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_attach_part(uuid,integer,uuid,text,numeric,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_answer_file_deleted(uuid) from public,anon,authenticated,service_role;
revoke all on function public.rpc_ielts_speaking_mock_submit(uuid) from public,anon,authenticated,service_role;

grant execute on function
 public.rpc_ielts_approve_speaking_mock_package(text,text,jsonb),
 public.rpc_ielts_publish_speaking_mock(text,text,text),
 public.rpc_ielts_speaking_mock_script(uuid),
 public.rpc_ielts_create_speaking_mock_script(uuid,text,text,jsonb,jsonb,jsonb),
 public.rpc_ielts_review_speaking_mock_audio(uuid,text,boolean,text),
 public.rpc_ielts_release_speaking_mock_script(uuid),
 public.rpc_ielts_set_school_voice_agreement(uuid,boolean,text),
 public.rpc_ielts_record_voice_legal_review(text[],text),
 public.rpc_ielts_assign_speaking_mock(text,jsonb),
 public.rpc_ielts_cancel_speaking_mock_assignment(uuid),
 public.rpc_ielts_speaking_mock_teacher_list(uuid),
 public.rpc_ielts_speaking_mock_home(),
 public.rpc_ielts_speaking_mock_sitting(uuid),
 public.rpc_ielts_start_speaking_mock(uuid,uuid,boolean,text,boolean,text),
 public.rpc_ielts_withdraw_speaking_voice_consent(uuid),
 public.rpc_ielts_speaking_mock_checks(uuid,jsonb),
 public.rpc_ielts_speaking_mock_replay(uuid,text),
 public.rpc_ielts_speaking_mock_prepare(uuid),
 public.rpc_ielts_speaking_mock_begin_answer(uuid,text,uuid),
 public.rpc_ielts_speaking_mock_answer_saved(uuid,uuid,boolean,boolean),
 public.rpc_ielts_speaking_mock_finish(uuid)
to authenticated;
grant execute on function
 public.rpc_ielts_register_speaking_mock_audio(uuid,text,text,text,numeric,bigint,text,text,text),
 public.rpc_ielts_speaking_mock_verify_answer(uuid,text,numeric),
 public.rpc_ielts_speaking_mock_attach_part(uuid,integer,uuid,text,numeric,jsonb),
 public.rpc_ielts_speaking_mock_answer_file_deleted(uuid),
 public.rpc_ielts_speaking_mock_submit(uuid)
to service_role;
