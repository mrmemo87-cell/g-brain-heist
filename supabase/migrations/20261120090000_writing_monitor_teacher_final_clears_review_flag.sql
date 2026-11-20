-- Writing monitor: a teacher's final review resolves the writing-process flag.
--
-- rpc_bh_writing_teacher_monitoring marked a student 'needs_review' whenever their latest piece carried
-- integrity review_status = 'review_recommended', even after the teacher had finalized a review of that
-- same piece. The teacher then saw "Needs support" next to the score they had just confirmed.
--
-- Only that one condition changes: the flag still applies unless the latest canonical assessment is a
-- teacher_final review of the latest attempt. Edited in place so the rest of this 15 KB function is
-- untouched; the migration stops if the expected text is not found exactly once.
do $migration$
declare
  v_sig constant regprocedure := 'public.rpc_bh_writing_teacher_monitoring(text,integer,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_sig);
  v_old constant text := $old$when coalesce(cur.latest_payload->'integrity'->>'review_status',cur.latest_payload->'integrity_signals'->>'review_status')='review_recommended' then 'needs_review'$old$;
  v_new constant text := $new$when coalesce(cur.latest_payload->'integrity'->>'review_status',cur.latest_payload->'integrity_signals'->>'review_status')='review_recommended' and not (latest_verified.canonical_status = 'teacher_final' and latest_verified.attempt_key = cur.latest_payload->>'id') then 'needs_review'$new$;
  v_acl aclitem[];
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'writing monitor migration: expected status condition not found exactly once';
  end if;
  select proacl into v_acl from pg_proc where oid = v_sig;
  execute replace(v_def, v_old, v_new);
  -- CREATE OR REPLACE keeps owner and grants; confirm nothing changed.
  if (select proacl from pg_proc where oid = v_sig) is distinct from v_acl then
    raise exception 'writing monitor migration: function privileges changed unexpectedly';
  end if;
end
$migration$;
