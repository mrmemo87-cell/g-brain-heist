-- Admission Hub official Brain Heist admission bank ownership/lockdown.
-- Prepares adm_question_pools/adm_questions for platform-owned seeded content while
-- preserving legacy school/global pools for compatibility.

alter table public.adm_question_pools
  add column if not exists is_official boolean not null default false,
  add column if not exists is_locked boolean not null default false,
  add column if not exists content_owner text not null default 'legacy_custom',
  add column if not exists content_version text not null default 'legacy',
  add column if not exists source_label text not null default 'Legacy/custom admission content',
  add column if not exists placement_band text null,
  add column if not exists stage_level smallint null;

alter table public.adm_questions
  add column if not exists is_official boolean not null default false,
  add column if not exists is_locked boolean not null default false,
  add column if not exists content_owner text not null default 'legacy_custom',
  add column if not exists content_version text not null default 'legacy',
  add column if not exists source_label text not null default 'Legacy/custom admission content',
  add column if not exists placement_band text null,
  add column if not exists strand text null,
  add column if not exists subskill text null,
  add column if not exists estimated_seconds integer null,
  add column if not exists writing_rubric jsonb null,
  add column if not exists reading_passage_id text null;

alter table public.adm_question_pools drop constraint if exists adm_question_pools_subject_check;
alter table public.adm_question_pools add constraint adm_question_pools_subject_check
  check (subject in ('english', 'math', 'maths', 'science'));

alter table public.adm_blueprints drop constraint if exists adm_blueprints_subject_check;
alter table public.adm_blueprints add constraint adm_blueprints_subject_check
  check (subject in ('english', 'math', 'maths', 'science'));

alter table public.adm_question_pools drop constraint if exists adm_question_pools_placement_band_check;
alter table public.adm_question_pools add constraint adm_question_pools_placement_band_check
  check (placement_band is null or placement_band in ('foundation', 'target', 'stretch'));

alter table public.adm_questions drop constraint if exists adm_questions_placement_band_check;
alter table public.adm_questions add constraint adm_questions_placement_band_check
  check (placement_band is null or placement_band in ('foundation', 'target', 'stretch'));

alter table public.adm_questions drop constraint if exists adm_questions_question_type_check;
alter table public.adm_questions add constraint adm_questions_question_type_check
  check (question_type in (
    'mcq', 'gap_fill', 'error_correction', 'sentence_transformation',
    'word_formation', 'open_cloze', 'reading_comprehension', 'short_answer',
    'structured', 'matching', 'email_writing', 'essay_writing', 'writing_prompt'
  ));

create index if not exists idx_adm_qpool_official_active on public.adm_question_pools(is_official, is_locked, subject, stage) where is_active = true;
create index if not exists idx_adm_q_official_locked on public.adm_questions(is_official, is_locked, status);
create index if not exists idx_adm_q_placement_band on public.adm_questions(placement_band);
create index if not exists idx_adm_q_strand_subskill on public.adm_questions(strand, subskill);

-- Treat existing platform/global pools as official locked bank content. School-scoped
-- historical pools remain legacy/custom and are not deleted.
update public.adm_question_pools
set is_official = true,
    is_locked = true,
    content_owner = 'brain_heist',
    content_version = case when content_version = 'legacy' then 'legacy-import' else content_version end,
    source_label = 'Brain Heist Official Admission Bank',
    stage_level = coalesce(stage_level, stage)
where school_id is null;

update public.adm_questions q
set is_official = true,
    is_locked = true,
    content_owner = 'brain_heist',
    content_version = case when q.content_version = 'legacy' then 'legacy-import' else q.content_version end,
    source_label = 'Brain Heist Official Admission Bank',
    grade_level = coalesce(q.grade_level, qp.grade_level),
    stage_level = coalesce(q.stage_level, qp.stage, qp.stage_level),
    strand = coalesce(q.strand, q.diagnostic_skill, q.skill_tag, q.topic)
from public.adm_question_pools qp
where qp.id = q.pool_id
  and qp.school_id is null;

create or replace function public.adm_is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
    or exists (select 1 from public.superadmins s where s.user_id = p_user_id)
    or exists (
      select 1 from public.users u
      where u.id = p_user_id
        and (coalesce(u.is_admin, false) = true or coalesce(u.role, '') in ('admin', 'superadmin'))
    );
$$;

grant execute on function public.adm_is_platform_admin(uuid) to authenticated, service_role;

-- RLS lockdown: authenticated school users may SELECT active official content, but
-- only platform admins/service role may insert/update/delete official/locked content.
drop policy if exists "adm_qpool_platform_admin_all" on public.adm_question_pools;
create policy "adm_qpool_platform_admin_all"
  on public.adm_question_pools for all
  using (public.adm_is_platform_admin(auth.uid()))
  with check (public.adm_is_platform_admin(auth.uid()));

drop policy if exists "adm_qpool_official_select" on public.adm_question_pools;
create policy "adm_qpool_official_select"
  on public.adm_question_pools for select
  using (is_official = true and is_locked = true and is_active = true);

drop policy if exists "adm_q_school_admin_all" on public.adm_questions;
create policy "adm_q_school_admin_all"
  on public.adm_questions for all
  using (
    is_official = false and is_locked = false and exists (
      select 1 from public.adm_question_pools qp
      join public.school_members sm on sm.school_id = qp.school_id
      where qp.id = adm_questions.pool_id
        and sm.user_id = auth.uid()
        and sm.role_in_school = 'school_admin'
        and sm.status = 'active'
    )
  )
  with check (
    is_official = false and is_locked = false and exists (
      select 1 from public.adm_question_pools qp
      join public.school_members sm on sm.school_id = qp.school_id
      where qp.id = adm_questions.pool_id
        and qp.is_official = false
        and qp.is_locked = false
        and sm.user_id = auth.uid()
        and sm.role_in_school = 'school_admin'
        and sm.status = 'active'
    )
  );

drop policy if exists "adm_q_platform_admin_all" on public.adm_questions;
create policy "adm_q_platform_admin_all"
  on public.adm_questions for all
  using (public.adm_is_platform_admin(auth.uid()))
  with check (public.adm_is_platform_admin(auth.uid()));

drop policy if exists "adm_q_official_select" on public.adm_questions;
create policy "adm_q_official_select"
  on public.adm_questions for select
  using (
    status = 'published' and exists (
      select 1 from public.adm_question_pools qp
      where qp.id = adm_questions.pool_id
        and qp.is_official = true
        and qp.is_locked = true
        and qp.is_active = true
    )
  );

-- Keep direct UPDATE/DELETE safe even if a future policy accidentally widens access.
create or replace function public.adm_prevent_locked_content_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.adm_is_platform_admin(auth.uid()) then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and (coalesce(old.is_official, false) or coalesce(old.is_locked, false)) then
    raise exception 'Official Brain Heist admission content is locked for assessment fairness';
  end if;

  if tg_op in ('INSERT', 'UPDATE') and (coalesce(new.is_official, false) or coalesce(new.is_locked, false) or coalesce(new.content_owner, '') = 'brain_heist') then
    raise exception 'Only platform admins can create or mark official Brain Heist admission content';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists adm_question_pools_prevent_locked_mutation on public.adm_question_pools;
create trigger adm_question_pools_prevent_locked_mutation
  before insert or update or delete on public.adm_question_pools
  for each row execute function public.adm_prevent_locked_content_mutation();

drop trigger if exists adm_questions_prevent_locked_mutation on public.adm_questions;
create trigger adm_questions_prevent_locked_mutation
  before insert or update or delete on public.adm_questions
  for each row execute function public.adm_prevent_locked_content_mutation();
