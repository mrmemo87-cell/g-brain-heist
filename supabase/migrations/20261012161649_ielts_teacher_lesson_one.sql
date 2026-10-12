-- Diagnostic Bible 1.9.0 §§5,6.1,6.1.1,8A,13,15E. Teacher preparation only.
-- No new materials, publication, scoring, attempts or student history changes.
create function public.rpc_ielts_teacher_lesson_one(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare materials jsonb; school_brand jsonb;
begin
 if auth.uid() is null or coalesce((select is_banned from public.users where id=auth.uid()),true)
 or not coalesce(public.can_manage_ielts_practice_school(p_school),false) then
 raise exception using errcode='42501',message='not_authorized'; end if;
 select jsonb_build_object('id',id,'name',name,'logo_url',logo_url) into school_brand from public.schools where id=p_school;
 if school_brand is null then raise exception using errcode='42501',message='not_authorized'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'display_code',private.ielts_material_code('targeted',t.code),
 'title',t.title,'version',t.version,'content_sha256',t.content_sha256,'instructions',t.instructions,
 'teacher_notes',t.content->>'teacher_notes','questions',t.questions,
 'audio_bucket','ielts-targeted-listening','audio_path',t.audio_path,'audio_sha256',t.audio_sha256) order by t.code),'[]')
 into materials from private.ielts_learning_tasks t
 where t.code in ('bh-ielts-targeted-listening-l3-v1','bh-ielts-targeted-listening-l4-v1')
 and t.skill='listening' and t.purpose='guided_practice' and private.ielts_learning_publicly_released(t.code);
 return jsonb_build_object('school',school_brand,'lesson_code','IELTS-01','version','1.0.0','materials',materials);
end; $$;
revoke all on function public.rpc_ielts_teacher_lesson_one(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_teacher_lesson_one(uuid) to authenticated;

-- Retain assignment-bound student access; allow staff to prepare ONLY the two released guided tracks.
create or replace function private.can_read_ielts_learning_audio(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.ielts_learning_tasks t join private.ielts_learning_allocations a on a.task_code=t.code
 where t.audio_path=p_path and a.status in ('assigned','in_progress','submitted') and private.can_access_ielts_learning(a.id))
 or (auth.uid() is not null and not coalesce((select is_banned from public.users where id=auth.uid()),true)
 and exists(select 1 from private.ielts_learning_tasks t where t.audio_path=p_path
 and t.code in ('bh-ielts-targeted-listening-l3-v1','bh-ielts-targeted-listening-l4-v1')
 and t.skill='listening' and t.purpose='guided_practice' and private.ielts_learning_publicly_released(t.code)
 and exists(select 1 from public.schools s where public.can_manage_ielts_practice_school(s.id))));
$$;
revoke all on function private.can_read_ielts_learning_audio(text) from public,anon,authenticated,service_role;
grant execute on function private.can_read_ielts_learning_audio(text) to authenticated;
notify pgrst,'reload schema';
