-- Owner-requested private review drafts (IELTS-05..24) for one authorized school, plus an append-only
-- human review decision log. Teacher-only downloads; no student release, assignment, evidence or scoring change.
-- A recorded approval does not release anything by itself: classroom release stays a separate, explicit step.
create table private.ielts_review_draft_packs (
 school_id uuid not null references public.schools(id) on delete restrict,
 lesson_code text not null check (lesson_code ~ '^IELTS-(0[5-9]|1[0-9]|2[0-4])$'),
 title text not null check (length(btrim(title)) between 1 and 200),
 version text not null check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 object_path text not null unique,
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes integer not null check (size_bytes between 1 and 20000000),
 recordings jsonb not null default '[]'::jsonb check (jsonb_typeof(recordings)='array'),
 authorization_basis text not null,
 published_at timestamptz,
 primary key (school_id,lesson_code,version),
 check (object_path = 'review-drafts/'||school_id::text||'/'||lesson_code||'/'||version||'/'||sha256||'.zip')
);
alter table private.ielts_review_draft_packs enable row level security;
revoke all on private.ielts_review_draft_packs from public,anon,authenticated;

create table private.ielts_review_decisions (
 id bigint generated always as identity primary key,
 school_id uuid not null,
 lesson_code text not null,
 version text not null,
 pack_sha256 text not null check (pack_sha256 ~ '^[a-f0-9]{64}$'),
 decision text not null check (decision in ('approved','changes_requested')),
 notes text check (notes is null or length(notes) <= 4000),
 reviewer_id uuid not null references public.users(id) on delete restrict,
 decided_at timestamptz not null default now(),
 foreign key (school_id,lesson_code,version) references private.ielts_review_draft_packs(school_id,lesson_code,version) on delete restrict,
 check (decision = 'approved' or length(btrim(coalesce(notes,''))) > 0)
);
alter table private.ielts_review_decisions enable row level security;
revoke all on private.ielts_review_decisions from public,anon,authenticated;
create index ielts_review_decisions_pack_idx on private.ielts_review_decisions(school_id,lesson_code,version,decided_at desc);

-- Existing approved and template branches are preserved verbatim; review drafts add a school-scoped branch.
create or replace function public.can_read_ielts_teacher_pack(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and exists(select 1 from public.users u where u.id=(select auth.uid()) and not coalesce(u.is_banned,true))
 and (
  exists(select 1 from private.ielts_approved_teacher_packs p where p.object_path=p_path
   and p.released_at is not null and coalesce(public.can_manage_ielts_practice_school(p.school_id),false))
  or (
   exists(select 1 from private.ielts_teacher_pack_templates t where t.object_path=p_path and t.released_at is not null)
   and exists(select 1 from public.schools s where coalesce(public.can_manage_ielts_practice_school(s.id),false))
  )
  or exists(select 1 from private.ielts_review_draft_packs d where d.object_path=p_path
   and d.published_at is not null and coalesce(public.can_manage_ielts_practice_school(d.school_id),false))
 );
$$;
revoke all on function public.can_read_ielts_teacher_pack(text) from public,anon,authenticated;
grant execute on function public.can_read_ielts_teacher_pack(text) to authenticated;

create function public.rpc_ielts_review_draft_packs(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null
 or coalesce((select u.is_banned from public.users u where u.id=(select auth.uid())),true)
 or not coalesce(public.can_manage_ielts_practice_school(p_school),false) then
  raise exception using errcode='42501',message='not_authorized';
 end if;
 return jsonb_build_object('school_id',p_school,'release','review_draft',
  'can_decide',coalesce(public.is_superadmin((select auth.uid())),false),
  'packs',coalesce((
   select jsonb_agg(jsonb_build_object('lesson_code',d.lesson_code,'title',d.title,'version',d.version,
    'source_sha256',d.source_sha256,'object_path',d.object_path,'sha256',d.sha256,'size_bytes',d.size_bytes,
    'recordings',d.recordings,'published_at',d.published_at,
    'decision',(select jsonb_build_object('decision',r.decision,'notes',r.notes,'decided_at',r.decided_at,'pack_sha256',r.pack_sha256)
      from private.ielts_review_decisions r where r.school_id=d.school_id and r.lesson_code=d.lesson_code and r.version=d.version
      order by r.decided_at desc, r.id desc limit 1))
    order by d.lesson_code,d.version)
   from private.ielts_review_draft_packs d where d.school_id=p_school and d.published_at is not null
  ),'[]'::jsonb));
end;
$$;
revoke all on function public.rpc_ielts_review_draft_packs(uuid) from public,anon,authenticated;
grant execute on function public.rpc_ielts_review_draft_packs(uuid) to authenticated;

-- Only a platform owner (superadmin) may record a decision, and only for the exact bytes that were published.
create function public.rpc_ielts_record_review_decision(p_school uuid,p_lesson_code text,p_version text,p_pack_sha256 text,p_decision text,p_notes text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_notes text := nullif(btrim(coalesce(p_notes,'')),''); v_row private.ielts_review_decisions;
begin
 if (select auth.uid()) is null
 or coalesce((select u.is_banned from public.users u where u.id=(select auth.uid())),true)
 or not coalesce(public.can_manage_ielts_practice_school(p_school),false)
 or not coalesce(public.is_superadmin((select auth.uid())),false) then
  raise exception using errcode='42501',message='not_authorized';
 end if;
 if p_decision not in ('approved','changes_requested') then
  raise exception using errcode='22023',message='invalid_decision';
 end if;
 if p_decision='changes_requested' and v_notes is null then
  raise exception using errcode='22023',message='notes_required';
 end if;
 if v_notes is not null and length(v_notes)>4000 then
  raise exception using errcode='22023',message='notes_too_long';
 end if;
 if not exists(select 1 from private.ielts_review_draft_packs d where d.school_id=p_school and d.lesson_code=p_lesson_code
   and d.version=p_version and d.sha256=p_pack_sha256 and d.published_at is not null) then
  raise exception using errcode='22023',message='pack_mismatch';
 end if;
 insert into private.ielts_review_decisions(school_id,lesson_code,version,pack_sha256,decision,notes,reviewer_id)
 values (p_school,p_lesson_code,p_version,p_pack_sha256,p_decision,v_notes,(select auth.uid()))
 returning * into v_row;
 return jsonb_build_object('lesson_code',v_row.lesson_code,'version',v_row.version,'decision',v_row.decision,
  'notes',v_row.notes,'decided_at',v_row.decided_at,'pack_sha256',v_row.pack_sha256);
end;
$$;
revoke all on function public.rpc_ielts_record_review_decision(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_ielts_record_review_decision(uuid,text,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
