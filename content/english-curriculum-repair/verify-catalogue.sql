-- Run in a transaction and ROLLBACK. No student, question or school data changes.
create temporary table question_catalogue_parity(actor uuid,filters jsonb,cached jsonb);
do $verify$
declare t record; f jsonb;
begin
 for t in select distinct user_id from public.teachers where user_id is not null loop
  perform set_config('request.jwt.claim.sub',t.user_id::text,true);
  foreach f in array array['{"limit":50,"metadata":false}'::jsonb,'{"subject":"English","limit":50,"metadata":false}'::jsonb,'{"pool":"school","limit":50,"metadata":false}'::jsonb] loop
   insert into question_catalogue_parity values(t.user_id,f,public.rpc_teacher_question_browser(f));
  end loop;
  insert into question_catalogue_parity values(t.user_id,'{"facets":true}',public.rpc_teacher_question_facets(null,null));
 end loop;
end;
$verify$;
-- Force the original authoritative learning joins for the comparison, locally.
update private.question_learning_catalogue_state set revision=revision+1 where singleton;
do $verify$
declare t record; actual jsonb;
begin
 for t in select * from question_catalogue_parity loop
  perform set_config('request.jwt.claim.sub',t.actor::text,true);
  if t.filters ? 'facets' then actual:=public.rpc_teacher_question_facets(null,null);
  else actual:=public.rpc_teacher_question_browser(t.filters);end if;
  if actual is distinct from t.cached then raise exception 'question_catalogue_parity_failed';end if;
 end loop;
end;
$verify$;
select count(distinct actor) teachers,count(*) identical_responses from question_catalogue_parity;
