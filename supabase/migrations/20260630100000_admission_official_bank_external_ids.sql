-- Add stable external IDs for repeatable official Admission Bank imports.
-- Import scripts upsert by these keys instead of deleting/recreating content,
-- which keeps historical attempts safe.

alter table public.adm_question_pools
  add column if not exists external_id text;

alter table public.adm_questions
  add column if not exists external_id text;

create unique index if not exists idx_adm_qpool_external_id_unique
  on public.adm_question_pools(external_id)
  where external_id is not null;

create unique index if not exists idx_adm_q_external_id_unique
  on public.adm_questions(external_id)
  where external_id is not null;

comment on column public.adm_question_pools.external_id is
  'Stable platform seed/import key for official Admission Bank pool upserts.';

comment on column public.adm_questions.external_id is
  'Stable platform seed/import key for official Admission Bank question upserts.';
