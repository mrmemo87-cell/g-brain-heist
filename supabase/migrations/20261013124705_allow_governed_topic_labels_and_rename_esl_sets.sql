-- Permit only trusted topic relabelling; preserve assessed-content immutability.
CREATE OR REPLACE FUNCTION private.enforce_question_authority()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role'
    or current_user in ('postgres', 'supabase_admin', 'service_role');
  v_content_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_content_changed := row(
      new.subject, new.topic, new.topic_name, new.question_text, new.options,
      new.correct_answer, new.explanation, new.image_url, new.question_type
    ) is distinct from row(
      old.subject, old.topic, old.topic_name, old.question_text, old.options,
      old.correct_answer, old.explanation, old.image_url, old.question_type
    );

    if old.pool_scope in ('global', 'school')
       and old.verification_status in ('verified', 'retired')
       and v_content_changed
       -- Only trusted governance can relabel topics. Assessed content stays immutable.
       and not (
         v_service
         and row(new.subject,new.question_text,new.options,new.correct_answer,
           new.explanation,new.image_url,new.question_type)
         is not distinct from row(old.subject,old.question_text,old.options,old.correct_answer,
           old.explanation,old.image_url,old.question_type)
       ) then
      raise exception using errcode = '55000',
        message = 'verified_question_content_is_immutable';
    end if;

    if not v_service and row(
      new.content_origin, new.pool_scope, new.owner_school_id,
      new.verification_status, new.analytics_eligible, new.verified_at,
      new.verified_by, new.verified_by_authority, new.verified_content_hash,
      new.content_version
    ) is distinct from row(
      old.content_origin, old.pool_scope, old.owner_school_id,
      old.verification_status, old.analytics_eligible, old.verified_at,
      old.verified_by, old.verified_by_authority, old.verified_content_hash,
      old.content_version
    ) then
      raise exception using errcode = '42501',
        message = 'question_authority_fields_are_protected';
    end if;
  end if;

  if not v_service and (tg_op = 'INSERT' or new.pool_scope = 'teacher') then
    new.content_origin := 'teacher';
    new.pool_scope := 'teacher';
    new.owner_school_id := null;
    new.verification_status := 'unverified';
    new.analytics_eligible := false;
    new.is_public := false;
    new.verified_at := null;
    new.verified_by := null;
    new.verified_by_authority := null;
    new.verified_content_hash := null;
    new.curriculum_review_status := 'draft';
    new.curriculum_strand := null;
    new.curriculum_skill := null;
    new.curriculum_subskill := null;
    new.curriculum_objective := null;
  end if;

  new.current_content_hash := private.question_content_hash(
    new.id, new.question_text, new.options, new.correct_answer,
    new.explanation, new.image_url, new.question_type
  );
  new.content_fingerprint := private.question_content_fingerprint(
    new.subject, coalesce(nullif(new.topic_name, ''), new.topic),
    new.question_text, new.options, new.correct_answer, new.question_type
  );

  if tg_op = 'UPDATE'
     and new.pool_scope = 'teacher'
     and v_content_changed then
    new.content_revision := old.content_revision + 1;
    new.content_version := 'teacher-' || new.content_revision::text;
  end if;
  return new;
end;
$function$
;

-- Give shared verified-bank topics transferable skill names.
-- Separate first checks from unseen rechecks without changing question IDs or academic mappings.
do $rename$
declare v_count integer;
begin
 with names(key,title,path) as (values ('g7-l01','Past simple: irregular verbs and did','Foundation'),('g7-l02','Past simple and present perfect','Foundation'),('g7-l03','Reading: locating specific information','Foundation'),('g7-l04','Reading: feelings and supporting evidence','Foundation'),('g7-l05','Articles and uncountable nouns','Foundation'),('g7-l06','Connectors: linking ideas','Foundation'),('g7-l07','Passive voice: was and past participles','Foundation'),('g7-l08','Reported speech: tense and time changes','Foundation'),('g7-l09','Past deductions: must have and might have','Foundation'),('g7-l10','Third conditional: unreal past conditions and results','Foundation'),('g8-l01','Past simple: irregular verbs and did','Developing'),('g8-l02','Past simple and present perfect','Developing'),('g8-l03','Reading: locating specific information','Developing'),('g8-l04','Reading: feelings and supporting evidence','Developing'),('g8-l05','Articles and uncountable nouns','Developing'),('g8-l06','Connectors: linking ideas','Developing'),('g8-l07','Passive voice: was and past participles','Developing'),('g8-l08','Reported speech: tense and time changes','Developing'),('g8-l09','Past deductions: must have and might have','Developing'),('g8-l10','Third conditional: unreal past conditions and results','Developing')),
 renamed as (
 update public.questions q
 set topic=n.title||' · '||n.path||' · '||case when 'fresh-recheck'=any(q.tags) then 'Recheck' else 'Initial check' end,
 topic_name=n.title||' · '||n.path||' · '||case when 'fresh-recheck'=any(q.tags) then 'Recheck' else 'Initial check' end,
 updated_at=now()
 from names n
 where q.verified_external_id like 'esl-path-20261013-'||n.key||'-%'
 returning q.id)
 select count(*) into v_count from renamed;
 if v_count<>200 then raise exception 'Expected 200 ESL support items, renamed %',v_count;end if;
end;
$rename$;
