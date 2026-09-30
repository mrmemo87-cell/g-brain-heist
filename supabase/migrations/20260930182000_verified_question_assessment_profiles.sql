-- Governed external assessment metadata for Brains Heist Verified questions.
-- This metadata is deliberately separate from canonical skill identity and from
-- question content hashes. It describes how a verified item can contribute to
-- programme-specific assessment readiness evidence.

create table if not exists public.verified_question_assessment_profiles (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete restrict,
  question_content_hash text not null,
  provider_name text not null,
  programme_code text not null,
  source_version text not null,
  paper_component text not null,
  paper_section text,
  evidence_mode text not null,
  primary_assessment_objective text not null,
  assessment_objectives text[] not null,
  source_reference text,
  profile_hash text not null,
  status text not null default 'active',
  created_by_authority text not null default 'Brains Heist Academic Governance',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint verified_question_assessment_profiles_status_check
    check (status in ('active','retired')),
  constraint verified_question_assessment_profiles_identity_check
    check (
      length(trim(provider_name)) between 3 and 200
      and length(trim(programme_code)) between 2 and 40
      and length(trim(source_version)) between 2 and 80
      and length(trim(paper_component)) between 2 and 80
      and length(trim(evidence_mode)) between 2 and 80
      and primary_assessment_objective ~ '^AO[1-9][0-9]*$'
      and cardinality(assessment_objectives) between 1 and 10
    )
);

create unique index if not exists uq_verified_question_assessment_profiles_active
  on public.verified_question_assessment_profiles(
    question_id,question_content_hash,provider_name,programme_code,source_version
  )
  where status='active';

create index if not exists idx_verified_question_assessment_profiles_programme
  on public.verified_question_assessment_profiles(
    programme_code,source_version,paper_component,paper_section,primary_assessment_objective
  )
  where status='active';

alter table public.verified_question_assessment_profiles enable row level security;
revoke all on table public.verified_question_assessment_profiles from public,anon,authenticated;
grant select,insert,update,delete on table public.verified_question_assessment_profiles to service_role;

create or replace function public.rpc_govern_verified_question_assessment_profile(
  p_question_id uuid,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_question public.questions%rowtype;
  v_provider text;
  v_programme text;
  v_source_version text;
  v_paper text;
  v_section text;
  v_mode text;
  v_primary_ao text;
  v_aos text[];
  v_source_reference text;
  v_profile_hash text;
  v_profile_id uuid;
begin
  if p_question_id is null or p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception using errcode='22023',message='question_and_assessment_profile_required';
  end if;

  select q.* into v_question
  from public.questions q
  where q.id=p_question_id
    and q.is_active
    and q.content_origin='brain_heist'
    and q.verification_status='verified'
    and q.analytics_eligible
    and q.current_content_hash=q.verified_content_hash;

  if v_question.id is null then
    raise exception using errcode='23514',message='assessment_profile_requires_current_verified_question';
  end if;

  v_provider := trim(p_profile->>'providerName');
  v_programme := trim(p_profile->>'programmeCode');
  v_source_version := trim(p_profile->>'sourceVersion');
  v_paper := trim(p_profile->>'paperComponent');
  v_section := nullif(trim(p_profile->>'paperSection'),'');
  v_mode := trim(p_profile->>'evidenceMode');
  v_primary_ao := upper(trim(p_profile->>'primaryAssessmentObjective'));
  v_source_reference := nullif(trim(p_profile->>'sourceReference'),'');
  select coalesce(array_agg(distinct upper(trim(value)) order by upper(trim(value))),array[]::text[])
  into v_aos
  from jsonb_array_elements_text(coalesce(p_profile->'assessmentObjectives','[]'::jsonb));

  if public.academic_normalize_subject_key(v_question.subject) <> 'economics'
     and lower(trim(coalesce(v_question.subject_id,''))) <> 'economics' then
    raise exception using errcode='22023',message='economics_assessment_profile_requires_economics_question';
  end if;

  if v_provider <> 'Cambridge International Education'
     or v_programme <> '0455'
     or v_source_version <> '2027-2029' then
    raise exception using errcode='22023',message='unsupported_economics_assessment_profile_version';
  end if;

  if v_primary_ao not in ('AO1','AO2','AO3')
     or cardinality(v_aos)=0
     or not v_primary_ao=any(v_aos)
     or exists(select 1 from unnest(v_aos) ao where ao not in ('AO1','AO2','AO3')) then
    raise exception using errcode='22023',message='invalid_0455_assessment_objectives';
  end if;

  if v_paper='paper_1' then
    if v_section is not null
       or v_mode <> 'mcq'
       or v_primary_ao='AO3'
       or 'AO3'=any(v_aos) then
      raise exception using errcode='22023',message='invalid_0455_paper_1_profile';
    end if;
  elsif v_paper='paper_2' then
    if v_section='section_a' and v_mode <> 'data_response' then
      raise exception using errcode='22023',message='invalid_0455_paper_2_section_a_profile';
    elsif v_section='section_b' and v_mode <> 'structured_response' then
      raise exception using errcode='22023',message='invalid_0455_paper_2_section_b_profile';
    elsif v_section not in ('section_a','section_b') then
      raise exception using errcode='22023',message='invalid_0455_paper_2_section';
    end if;
  else
    raise exception using errcode='22023',message='invalid_0455_paper_component';
  end if;

  v_profile_hash := encode(extensions.digest(
    jsonb_build_object(
      'questionId',p_question_id,
      'questionContentHash',v_question.current_content_hash,
      'providerName',v_provider,
      'programmeCode',v_programme,
      'sourceVersion',v_source_version,
      'paperComponent',v_paper,
      'paperSection',v_section,
      'evidenceMode',v_mode,
      'primaryAssessmentObjective',v_primary_ao,
      'assessmentObjectives',to_jsonb(v_aos),
      'sourceReference',v_source_reference
    )::text,
    'sha256'
  ),'hex');

  update public.verified_question_assessment_profiles
  set status='retired',updated_at=now()
  where question_id=p_question_id
    and provider_name=v_provider
    and programme_code=v_programme
    and source_version=v_source_version
    and status='active'
    and (question_content_hash <> v_question.current_content_hash or profile_hash <> v_profile_hash);

  insert into public.verified_question_assessment_profiles(
    question_id,question_content_hash,provider_name,programme_code,source_version,
    paper_component,paper_section,evidence_mode,primary_assessment_objective,
    assessment_objectives,source_reference,profile_hash,status
  ) values (
    p_question_id,v_question.current_content_hash,v_provider,v_programme,v_source_version,
    v_paper,v_section,v_mode,v_primary_ao,v_aos,v_source_reference,v_profile_hash,'active'
  )
  on conflict (question_id,question_content_hash,provider_name,programme_code,source_version)
    where status='active'
  do update set
    paper_component=excluded.paper_component,
    paper_section=excluded.paper_section,
    evidence_mode=excluded.evidence_mode,
    primary_assessment_objective=excluded.primary_assessment_objective,
    assessment_objectives=excluded.assessment_objectives,
    source_reference=excluded.source_reference,
    profile_hash=excluded.profile_hash,
    updated_at=now()
  returning id into v_profile_id;

  return jsonb_build_object(
    'success',true,
    'profileId',v_profile_id,
    'profileHash',v_profile_hash,
    'questionId',p_question_id,
    'questionContentHash',v_question.current_content_hash
  );
end;
$function$;

revoke all on function public.rpc_govern_verified_question_assessment_profile(uuid,jsonb)
from public,anon,authenticated,service_role;
grant execute on function public.rpc_govern_verified_question_assessment_profile(uuid,jsonb)
to service_role;
