-- IELTS Speaking: teacher fixes to speech-to-text mistakes (Diagnostic Bible 2.7.2 section 10.7).
--
-- Owner request (2026-11-22): Scribe wrote "it's so cold" where Timur said "Silk Road". A teacher can now correct
-- the words of an interview transcript. The fix must also be useful:
--   * the original speech-to-text transcript is always kept; every fix is append-only history;
--   * highlights and pronunciation words that rested on the wrong words disappear at once;
--   * before sharing, the teacher can press a button to redo that part's AI feedback on the corrected words
--     (no new transcription, saved in ielts_speaking_fixed_feedback);
--   * a name the teacher fixes can be added to the school's word list, which is sent to Scribe with every new
--     recording from that school (the school's own name is always on it), so the same mistake is not repeated;
--   * each fix keeps what was heard, what was said and when, as checked data for a future in-house model.

create table if not exists private.ielts_speaking_transcript_fixes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references private.ielts_speaking_sessions(id),
  clip_id uuid not null references private.ielts_speaking_clips(id),
  -- The analysis whose transcript was corrected. A newer analysis starts without fixes.
  analysis_id uuid not null references private.ielts_speaking_clip_analysis(id),
  -- Words word_from .. word_from+word_count-1 of the previous text (split on spaces) were replaced by "said".
  word_from integer not null check (word_from >= 0),
  word_count integer not null check (word_count between 1 and 12),
  heard text not null check (length(heard) between 1 and 400),
  said text not null check (length(said) <= 300 and said !~ '[\r\n\t]'),
  start_seconds numeric check (start_seconds is null or start_seconds >= 0),
  end_seconds numeric check (end_seconds is null or end_seconds >= 0),
  -- The whole transcript after this fix, and the word spans [[from, count], ...] the teacher has typed.
  transcript text not null check (length(transcript) <= 20000),
  marks jsonb not null default '[]'::jsonb check (jsonb_typeof(marks) = 'array'),
  fixed_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists ielts_speaking_transcript_fixes_clip on private.ielts_speaking_transcript_fixes(analysis_id, created_at desc);
create index if not exists ielts_speaking_transcript_fixes_session on private.ielts_speaking_transcript_fixes(session_id);
alter table private.ielts_speaking_transcript_fixes enable row level security;
revoke all on private.ielts_speaking_transcript_fixes from public, anon, authenticated, service_role;

-- AI feedback redone on a corrected transcript (one per fix).
create table if not exists private.ielts_speaking_fixed_feedback (
  id uuid primary key default gen_random_uuid(),
  fix_id uuid not null unique references private.ielts_speaking_transcript_fixes(id),
  session_id uuid not null references private.ielts_speaking_sessions(id),
  clip_id uuid not null references private.ielts_speaking_clips(id),
  highlights jsonb not null check (jsonb_typeof(highlights) = 'array' and jsonb_array_length(highlights) <= 12),
  pronunciation jsonb not null check (jsonb_typeof(pronunciation) = 'object'),
  speaker_turns jsonb not null default '{}'::jsonb check (jsonb_typeof(speaker_turns) = 'object'),
  prompt_version text not null check (length(prompt_version) between 3 and 200),
  provider text check (length(provider) <= 200),
  requested_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
alter table private.ielts_speaking_fixed_feedback enable row level security;
revoke all on private.ielts_speaking_fixed_feedback from public, anon, authenticated, service_role;

-- Names and words a school's recordings often contain. Sent to Scribe as key terms; never the test questions.
create table if not exists private.ielts_speaking_school_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  term text not null check (length(term) between 2 and 50 and term !~ '[\r\n\t]' and array_length(regexp_split_to_array(term, '\s+'), 1) <= 5),
  added_by uuid references public.users(id),
  from_fix_id uuid references private.ielts_speaking_transcript_fixes(id),
  created_at timestamptz not null default now()
);
create unique index if not exists ielts_speaking_school_terms_unique on private.ielts_speaking_school_terms(school_id, lower(term));
alter table private.ielts_speaking_school_terms enable row level security;
revoke all on private.ielts_speaking_school_terms from public, anon, authenticated, service_role;

drop trigger if exists speaking_transcript_fixes_history on private.ielts_speaking_transcript_fixes;
create trigger speaking_transcript_fixes_history before update or delete on private.ielts_speaking_transcript_fixes
  for each row execute function private.guard_ielts_speaking_extras_history();
drop trigger if exists speaking_fixed_feedback_history on private.ielts_speaking_fixed_feedback;
create trigger speaking_fixed_feedback_history before update or delete on private.ielts_speaking_fixed_feedback
  for each row execute function private.guard_ielts_speaking_extras_history();

-- Starting list for Silk Road International School (the owner's correction of Timur's interview).
insert into private.ielts_speaking_school_terms(school_id, term)
select s.id, t.term from public.schools s cross join (values ('Silk Road'), ('Bishkek'), ('Kyrgyzstan')) t(term)
where s.name = 'Silk Road International School'
on conflict do nothing;

-- Key terms for one student's school: the school's own name first, then its list. Service only.
create or replace function public.rpc_ielts_speaking_terms_for_student(p_student_id uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  with school as (select u.school_id from public.users u where u.id = p_student_id and u.school_id is not null),
  terms as (
    select 0 as o, s.name as term, now() as at from public.schools s join school on school.school_id = s.id
      where length(s.name) between 2 and 50 and array_length(regexp_split_to_array(s.name, '\s+'), 1) <= 5
    union all
    select 1, t.term, t.created_at from private.ielts_speaking_school_terms t join school on school.school_id = t.school_id
  )
  select coalesce(array_agg(term order by o, at) filter (where term is not null), '{}'::text[])
  from (select distinct on (lower(term)) o, term, at from terms order by lower(term), o, at limit 200) x;
$$;
revoke all on function public.rpc_ielts_speaking_terms_for_student(uuid) from public, anon, authenticated;
grant execute on function public.rpc_ielts_speaking_terms_for_student(uuid) to service_role;
create or replace function public.rpc_ielts_speaking_terms_for_session(p_session_id uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.rpc_ielts_speaking_terms_for_student(s.student_id) from private.ielts_speaking_sessions s where s.id = p_session_id), '{}'::text[]);
$$;
revoke all on function public.rpc_ielts_speaking_terms_for_session(uuid) from public, anon, authenticated;
grant execute on function public.rpc_ielts_speaking_terms_for_session(uuid) to service_role;

-- The transcript shown for one analysis: the latest fix when there is one.
create or replace function private.ielts_speaking_latest_fix(p_analysis_id uuid) returns private.ielts_speaking_transcript_fixes
language sql stable security definer set search_path = '' as $$
  select * from private.ielts_speaking_transcript_fixes where analysis_id = p_analysis_id order by created_at desc, id desc limit 1;
$$;
revoke all on function private.ielts_speaking_latest_fix(uuid) from public, anon, authenticated;

-- True when a phrase still appears in the text (case and spacing ignored).
create or replace function private.ielts_speaking_text_has(p_text text, p_phrase text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(length(trim(p_phrase)) > 0 and position(lower(regexp_replace(trim(p_phrase), '\s+', ' ', 'g'))
    in lower(regexp_replace(p_text, '\s+', ' ', 'g'))) > 0, false);
$$;

/**
 * A teacher replaces words of the current transcript. p_expected_fix_id is the latest fix the teacher saw (null for
 * none), so two teachers cannot overwrite each other. An empty p_said removes words speech-to-text invented.
 */
create or replace function public.rpc_ielts_fix_speaking_transcript(
  p_session_id uuid, p_clip_id uuid, p_expected_fix_id uuid, p_word_from integer, p_word_count integer, p_said text,
  p_start_seconds numeric default null, p_end_seconds numeric default null, p_add_term boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s private.ielts_speaking_sessions; a private.ielts_speaking_clip_analysis; f private.ielts_speaking_transcript_fixes;
  base text; base_marks jsonb; tokens text[]; said_tokens text[]; said text; heard text; delta integer; n integer;
  new_marks jsonb := '[]'::jsonb; m jsonb; mf integer; mc integer; new_id uuid; duration numeric;
begin
  select * into s from private.ielts_speaking_sessions where id = p_session_id;
  if s.id is null or not private.can_review_ielts_speaking_student(s.student_id) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if s.status <> 'submitted' then raise exception 'speaking_fix_not_submitted'; end if;
  select c.duration_seconds into duration from private.ielts_speaking_clips c where c.id = p_clip_id and c.session_id = s.id;
  if not found then raise exception 'speaking_clip_mismatch'; end if;
  select * into a from private.ielts_speaking_clip_analysis where clip_id = p_clip_id order by created_at desc, id desc limit 1;
  if a.id is null then raise exception 'speaking_fix_no_transcript'; end if;
  f := private.ielts_speaking_latest_fix(a.id);
  if f.id is distinct from p_expected_fix_id then raise exception 'speaking_fix_changed'; end if;
  base := coalesce(f.transcript, a.transcript);
  base_marks := coalesce(f.marks, '[]'::jsonb);
  tokens := regexp_split_to_array(trim(base), '\s+');
  n := coalesce(array_length(tokens, 1), 0);
  if p_word_from is null or p_word_count is null or p_word_from < 0 or p_word_count < 1 or p_word_count > 12
     or p_word_from + p_word_count > n then raise exception 'speaking_fix_range'; end if;
  said := regexp_replace(trim(coalesce(p_said, '')), '\s+', ' ', 'g');
  if length(said) > 300 or said ~ '[<>{}\[\]]' then raise exception 'speaking_fix_text'; end if;
  heard := array_to_string(tokens[p_word_from + 1 : p_word_from + p_word_count], ' ');
  if said = heard then raise exception 'speaking_fix_unchanged'; end if;
  said_tokens := case when said = '' then '{}'::text[] else regexp_split_to_array(said, ' ') end;
  if coalesce(array_length(said_tokens, 1), 0) > 24 then raise exception 'speaking_fix_text'; end if;
  if (p_start_seconds is not null and (p_start_seconds < 0 or p_start_seconds > duration + 1))
     or (p_end_seconds is not null and (p_end_seconds < coalesce(p_start_seconds, 0) or p_end_seconds > duration + 1)) then
    raise exception 'speaking_fix_time';
  end if;
  delta := coalesce(array_length(said_tokens, 1), 0) - p_word_count;
  -- Earlier marks before the fix stay, those after it move, and those it touches are replaced by the new one.
  for m in select * from jsonb_array_elements(base_marks) loop
    mf := (m->>0)::integer; mc := (m->>1)::integer;
    if mf + mc <= p_word_from then new_marks := new_marks || jsonb_build_array(jsonb_build_array(mf, mc));
    elsif mf >= p_word_from + p_word_count then new_marks := new_marks || jsonb_build_array(jsonb_build_array(mf + delta, mc));
    end if;
  end loop;
  if coalesce(array_length(said_tokens, 1), 0) > 0 then
    new_marks := new_marks || jsonb_build_array(jsonb_build_array(p_word_from, array_length(said_tokens, 1)));
  end if;
  select coalesce(jsonb_agg(x order by (x->>0)::integer), '[]'::jsonb) into new_marks from jsonb_array_elements(new_marks) x;
  insert into private.ielts_speaking_transcript_fixes(session_id, clip_id, analysis_id, word_from, word_count, heard, said,
    start_seconds, end_seconds, transcript, marks, fixed_by)
  values (s.id, p_clip_id, a.id, p_word_from, p_word_count, left(heard, 400), said, p_start_seconds, p_end_seconds,
    array_to_string(tokens[1 : p_word_from] || said_tokens || tokens[p_word_from + p_word_count + 1 : n], ' '), new_marks, auth.uid())
  returning id into new_id;
  if coalesce(p_add_term, false) and said <> '' and s.school_id is not null and length(said) between 2 and 50
     and array_length(said_tokens, 1) <= 5 then
    insert into private.ielts_speaking_school_terms(school_id, term, added_by, from_fix_id)
    values (s.school_id, regexp_replace(said, '[.,;:!?]+$', ''), auth.uid(), new_id) on conflict do nothing;
  end if;
  return public.rpc_ielts_speaking_session_extras(s.id);
end $$;
revoke all on function public.rpc_ielts_fix_speaking_transcript(uuid, uuid, uuid, integer, integer, text, numeric, numeric, boolean) from public, anon;
grant execute on function public.rpc_ielts_fix_speaking_transcript(uuid, uuid, uuid, integer, integer, text, numeric, numeric, boolean) to authenticated;

-- Saved by the speaking function (service role) after the teacher pressed "Update AI feedback".
create or replace function public.rpc_ielts_save_speaking_fixed_feedback(
  p_fix_id uuid, p_highlights jsonb, p_pronunciation jsonb, p_speaker_turns jsonb, p_prompt_version text, p_provider text, p_requested_by uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare f private.ielts_speaking_transcript_fixes; begin
  select * into f from private.ielts_speaking_transcript_fixes where id = p_fix_id;
  if f.id is null then raise exception 'speaking_fix_missing'; end if;
  if exists(select 1 from private.ielts_speaking_reviews where session_id = f.session_id) then raise exception 'speaking_fix_shared'; end if;
  insert into private.ielts_speaking_fixed_feedback(fix_id, session_id, clip_id, highlights, pronunciation, speaker_turns, prompt_version, provider, requested_by)
  values (f.id, f.session_id, f.clip_id, coalesce(p_highlights, '[]'::jsonb), coalesce(p_pronunciation, '{}'::jsonb),
    coalesce(p_speaker_turns, '{}'::jsonb), left(coalesce(p_prompt_version, 'unknown'), 200), left(p_provider, 200), p_requested_by)
  on conflict (fix_id) do nothing;
end $$;
revoke all on function public.rpc_ielts_save_speaking_fixed_feedback(uuid, jsonb, jsonb, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.rpc_ielts_save_speaking_fixed_feedback(uuid, jsonb, jsonb, jsonb, text, text, uuid) to service_role;

-- Transcripts now show the latest fix. Until the feedback is redone, highlights and pronunciation words whose
-- words are no longer in the corrected text are left out. Teachers also get the original, the fixes and the marks.
create or replace function public.rpc_ielts_speaking_session_extras(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
declare s private.ielts_speaking_sessions; teacher boolean; reviewed boolean; b private.ielts_speaking_part_bands; e private.ielts_speaking_ai_estimates; begin
 if not private.can_access_ielts_speaking(p_session_id) then raise exception using errcode = '42501', message = 'not_authorized'; end if;
 select * into s from private.ielts_speaking_sessions where id = p_session_id;
 teacher := private.can_review_ielts_speaking_student(s.student_id);
 reviewed := exists(select 1 from private.ielts_speaking_reviews where session_id = s.id);
 if not teacher and not reviewed then
  return jsonb_build_object('analysis', '[]'::jsonb, 'part_bands', null, 'can_set_bands', false, 'ai_estimates', null);
 end if;
 select * into b from private.ielts_speaking_part_bands where session_id = s.id order by created_at desc, id desc limit 1;
 if teacher then
  select * into e from private.ielts_speaking_ai_estimates where session_id = s.id and version = private.ielts_speaking_estimate_version()
   and source_hash = private.ielts_speaking_source_hash(s.id) order by created_at desc, id desc limit 1;
  if e.id is null and reviewed then
   select * into e from private.ielts_speaking_ai_estimates where session_id = s.id
    and source_hash = private.ielts_speaking_source_hash(s.id) order by created_at desc, id desc limit 1;
  end if;
 end if;
 return jsonb_build_object(
  'analysis', coalesce((select jsonb_agg(
     jsonb_build_object('clip_id', a.clip_id, 'part', c.part,
       'transcript', coalesce(fx.transcript, a.transcript),
       'highlights', case when fb.id is not null then fb.highlights when fx.id is null then a.highlights
         else coalesce((select jsonb_agg(h) from jsonb_array_elements(a.highlights) h
           where private.ielts_speaking_text_has(fx.transcript, h->>'quote')), '[]'::jsonb) end,
       'pronunciation', case when fb.id is not null then fb.pronunciation when fx.id is null then a.pronunciation
         else jsonb_set(a.pronunciation, '{words}', coalesce((select jsonb_agg(w) from jsonb_array_elements(coalesce(a.pronunciation->'words', '[]'::jsonb)) w
           where fx.transcript ~* ('(^|[^[:alpha:]''])' || regexp_replace(w->>'word', '([^[:alnum:]])', '\\\1', 'g') || '($|[^[:alpha:]''])')), '[]'::jsonb), true) end,
       'speaker_turns', case when fb.id is not null and fb.speaker_turns <> '{}'::jsonb then fb.speaker_turns else a.speaker_turns end,
       'prompt_version', a.prompt_version, 'created_at', a.created_at)
     || case when teacher then jsonb_build_object('fix', jsonb_build_object(
          'id', fx.id, 'marks', coalesce(fx.marks, '[]'::jsonb),
          'original_transcript', case when fx.id is null then null else a.transcript end,
          'feedback_updated', fb.id is not null,
          'history', coalesce((select jsonb_agg(jsonb_build_object('heard', x.heard, 'said', x.said, 'created_at', x.created_at,
              'teacher_name', (select coalesce(nullif(u.full_name, ''), u.username) from public.users u where u.id = x.fixed_by)) order by x.created_at)
            from private.ielts_speaking_transcript_fixes x where x.analysis_id = a.id), '[]'::jsonb)))
        else '{}'::jsonb end
     order by c.part, c.created_at, c.id)
   from (select distinct on (x.clip_id) x.* from private.ielts_speaking_clip_analysis x where x.session_id = s.id
         order by x.clip_id, x.created_at desc, x.id desc) a
   join private.ielts_speaking_clips c on c.id = a.clip_id
   left join lateral (select * from private.ielts_speaking_latest_fix(a.id) z where z.id is not null) fx on true
   left join private.ielts_speaking_fixed_feedback fb on fb.fix_id = fx.id), '[]'::jsonb),
  'missing_clips', case when teacher then (select count(*) from private.ielts_speaking_clips c where c.session_id = s.id
     and not exists(select 1 from private.ielts_speaking_clip_analysis a where a.clip_id = c.id
       and (reviewed or a.prompt_version = private.ielts_speaking_analysis_version()))) else 0 end,
  'part_bands', case when b.id is null then null else jsonb_build_object('part_1', b.part_1, 'part_2', b.part_2, 'part_3', b.part_3,
     'fluency_coherence', b.fluency_coherence, 'lexical_resource', b.lexical_resource,
     'grammar_range_accuracy', b.grammar_range_accuracy, 'pronunciation', b.pronunciation, 'overall', b.overall,
     'created_at', b.created_at, 'teacher_name', (select coalesce(nullif(u.full_name, ''), u.username) from public.users u where u.id = b.reviewer_id)) end,
  'can_set_bands', teacher and s.status = 'submitted',
  -- Section 10.7 (2.7.2): any reviewing teacher may fix words; AI feedback is redone only before sharing.
  'can_fix_transcript', teacher and s.status = 'submitted',
  'can_update_feedback', teacher and s.status = 'submitted' and not reviewed,
  'can_add_terms', teacher and s.status = 'submitted' and s.school_id is not null,
  -- Section 10.9: AI estimates are for the reviewing teacher only.
  'ai_estimates', case when teacher and e.id is not null then e.estimates || jsonb_build_object('created_at', e.created_at) else null end);
end $function$;
revoke all on function public.rpc_ielts_speaking_session_extras(uuid) from public, anon, service_role;
grant execute on function public.rpc_ielts_speaking_session_extras(uuid) to authenticated;
