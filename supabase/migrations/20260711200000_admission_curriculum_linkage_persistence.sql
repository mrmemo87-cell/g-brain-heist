-- Additive Admission Bank curriculum-linkage persistence for reporting/auditing.
-- Nullable by design so historical school/admin and legacy official rows remain valid.

alter table public.adm_question_pools
  add column if not exists curriculum_linkage_status text null,
  add column if not exists curriculum_map_id text null,
  add column if not exists curriculum_map_version text null,
  add column if not exists curriculum_programme text null,
  add column if not exists curriculum_subject_code text null,
  add column if not exists curriculum_source_version text null,
  add column if not exists curriculum_review_status text null;

alter table public.adm_questions
  add column if not exists curriculum_objective_id text null,
  add column if not exists curriculum_source_reference text null,
  add column if not exists curriculum_review_status text null;

comment on column public.adm_question_pools.curriculum_linkage_status is 'Admission Bank curriculum-linkage compatibility state, e.g. linked or legacy_review_required; nullable for historical rows.';
comment on column public.adm_question_pools.curriculum_map_id is 'Approved production curriculum-map identifier used to author or audit this official pool.';
comment on column public.adm_question_pools.curriculum_map_version is 'Approved production curriculum-map version used to author or audit this official pool.';
comment on column public.adm_questions.curriculum_objective_id is 'Curriculum objective id linked from approved seed JSON; nullable for legacy/historical rows.';
comment on column public.adm_questions.curriculum_source_reference is 'Source reference for the linked curriculum objective, persisted for audit reporting.';

create index if not exists idx_adm_qpool_curriculum_map
  on public.adm_question_pools(curriculum_map_id, curriculum_map_version)
  where curriculum_map_id is not null;

create index if not exists idx_adm_qpool_curriculum_linkage_status
  on public.adm_question_pools(curriculum_linkage_status, subject, grade_level)
  where curriculum_linkage_status is not null;

create index if not exists idx_adm_q_curriculum_objective
  on public.adm_questions(curriculum_objective_id)
  where curriculum_objective_id is not null;

create index if not exists idx_adm_q_curriculum_review_status
  on public.adm_questions(curriculum_review_status)
  where curriculum_review_status is not null;
