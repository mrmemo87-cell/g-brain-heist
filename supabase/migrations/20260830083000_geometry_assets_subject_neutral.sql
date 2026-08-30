-- Saved Geometry Builder diagrams are reusable teacher-owned visual assets.
-- Academic subject belongs to the final question that consumes the asset.

alter table if exists public.geometry_questions
  alter column subject drop not null;

alter table if exists public.geometry_questions
  alter column subject drop default;

comment on column public.geometry_questions.subject is
  'Legacy classification only. New saved diagram assets are subject-neutral; the consuming teacher question owns subject classification.';
