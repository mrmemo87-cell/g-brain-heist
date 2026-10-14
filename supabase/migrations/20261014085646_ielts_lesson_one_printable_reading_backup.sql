-- Teacher-only printable fallback: one already released guided Reading task.
-- No screener passages/keys, independent R-002, publication or saved attempt changes.
-- Diagnostic Bible 1.9.0; Lessons Bible 1.0.0 LB-01/02/05/06/07/09.
set lock_timeout = '5s';
-- Diagnostic Bible 1.9.0 §§5,6.1,6.1.1,8A,13,15E. Teacher preparation only.
-- No new materials, publication, scoring, attempts or student history changes.
create or replace function public.rpc_ielts_teacher_lesson_one(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare materials jsonb; school_brand jsonb; reading_backup jsonb;
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
 select jsonb_build_object('code',t.code,'display_code',private.ielts_material_code('targeted',t.code),
 'title',t.title,'version',t.version,'content_sha256',t.content_sha256,'instructions',t.instructions,
 'passage',t.content->>'passage','teacher_notes',t.content->>'teacher_notes','questions',t.questions)
 into reading_backup from private.ielts_learning_tasks t
 where t.code='bh-ielts-targeted-reading-r1-v1'
 and t.skill='reading' and t.purpose='guided_practice'
 and private.ielts_learning_publicly_released(t.code)
 and nullif(t.content->>'passage','') is not null
 and jsonb_typeof(t.questions)='array' and jsonb_array_length(t.questions)=6;
 return jsonb_build_object('school',school_brand,'lesson_code','IELTS-01','version','1.1.0',
 'materials',materials,'reading_backup',reading_backup);
end; $$;
revoke all on function public.rpc_ielts_teacher_lesson_one(uuid) from public,anon,authenticated,service_role;
grant execute on function public.rpc_ielts_teacher_lesson_one(uuid) to authenticated;
notify pgrst,'reload schema';
