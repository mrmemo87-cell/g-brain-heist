-- Run inside BEGIN/ROLLBACK after the migration. Never commit test fixtures.
create temporary table hold_insert_fixture(assignment_id uuid,question_id uuid);
create trigger hold_insert_fixture before insert or update of question_id,assignment_id on hold_insert_fixture
 for each row execute function private.guard_held_assignment_question();
create temporary table hold_publish_fixture(id uuid,publish_status text);
create trigger hold_publish_fixture before update of publish_status on hold_publish_fixture
 for each row execute function private.guard_held_assignment_publication();
do $test$
declare h private.question_selection_holds%rowtype; new_id uuid:=gen_random_uuid(); old_id uuid:=gen_random_uuid(); aq record;
begin
 select * into strict h from private.question_selection_holds order by question_id limit 1;
 begin
  insert into hold_insert_fixture values(new_id,h.question_id);
  raise exception 'TEST_FAILED: new selection was accepted';
 exception when check_violation then
  if sqlerrm not like 'QUESTION_UNDER_EDITORIAL_REVIEW:%' then raise; end if;
 end;
 update private.question_selection_holds set published_assignment_ids=array_append(published_assignment_ids,old_id)
  where question_id=h.question_id and question_content_hash=h.question_content_hash;
 insert into hold_insert_fixture values(old_id,h.question_id);
 begin
  update hold_insert_fixture set assignment_id=new_id where assignment_id=old_id;
  raise exception 'TEST_FAILED: moving grandfathered item to new assignment accepted';
 exception when check_violation then null;
 end;
 update private.question_selection_holds set released_at=now() where question_id=h.question_id;
 insert into hold_insert_fixture values(new_id,h.question_id);
 update private.question_selection_holds set released_at=null where question_id=h.question_id;
 -- An existing reference supplies the real publication join; only the private hold and temporary row change.
 select assignment_id,question_id into strict aq from public.assignment_questions
 where question_id not in(select question_id from private.question_selection_holds) limit 1;
 insert into private.question_selection_holds(question_id,question_content_hash,reason,source_reference,created_by_authority)
 select id,current_content_hash,'test','rollback-only','rollback-only' from public.questions where id=aq.question_id;
 insert into hold_publish_fixture values(aq.assignment_id,'draft');
 begin
  update hold_publish_fixture set publish_status='scheduled';
  raise exception 'TEST_FAILED: draft scheduling was accepted';
 exception when check_violation then null;
 end;
 begin
  update hold_publish_fixture set publish_status='published';
  raise exception 'TEST_FAILED: draft publication was accepted';
 exception when check_violation then null;
 end;
 update private.question_selection_holds set published_assignment_ids=array[aq.assignment_id] where question_id=aq.question_id;
 update hold_publish_fixture set publish_status='published';
 -- Historical hash holds do not block a revised current version.
 update private.question_selection_holds set question_content_hash=repeat('0',64) where question_id=h.question_id;
 insert into hold_insert_fixture values(gen_random_uuid(),h.question_id);
 if has_table_privilege('authenticated','private.question_selection_holds','select')
 or has_table_privilege('anon','private.question_selection_holds','select') then raise exception 'TEST_FAILED: private holds exposed'; end if;
 raise notice 'PASS: new selection, ID changes, draft scheduling/publication blocked; grandfather, release and new hash allowed; holds private';
end;$test$;
