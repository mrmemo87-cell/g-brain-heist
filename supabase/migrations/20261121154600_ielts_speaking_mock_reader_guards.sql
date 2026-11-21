-- Diagnostic Bible 2.7.0 section 10.12: a recorded-examiner practice mock is never a screener,
-- a first sitting, a starting point, a practice source, programme status or report evidence.
-- Each reader of Speaking sittings gets one added filter. The patch is applied to the live
-- definition and fails if the expected text is not found exactly once, so nothing else changes.
do $mig$
declare
  r record; d text; n int; acl aclitem[];
  guard constant text := $g$ and evidence_kind<>'practice_mock'$g$;
  sguard constant text := $g$ and s.evidence_kind<>'practice_mock'$g$;
begin
  for r in select * from (values
    ('public.rpc_ielts_start_speaking_interview(uuid,uuid,boolean)', $o$where student_id=p_student_id and status='in_progress'$o$, guard),
    ('public.rpc_ielts_start_speaking_pilot(uuid,boolean)', $o$where student_id=p.pilot_student and status='in_progress'$o$, guard),
    ('public.rpc_ielts_starting_point_summary()', $o$where s.student_id=actor and private.can_access_ielts_speaking(s.id)$o$, sguard),
    ('public.rpc_ielts_programme_workspace(uuid,text,integer)', $o$where s.student_id=u.id and s.school_id=p_school_id and private.can_access_ielts_speaking(s.id)$o$, sguard),
    ('public.rpc_ielts_speaking_workspace(uuid,text)', $o$from private.ielts_speaking_sessions s where s.student_id=chosen and private.can_access_ielts_speaking(s.id)$o$, sguard),
    ('private.ielts_report_evidence(uuid,uuid,timestamptz,timestamptz)', $o$where s.school_id=p_school and s.student_id=p_student and s.status='submitted' and s.submitted_at<=work_through$o$, sguard),
    ('private.ielts_student_productive_ratings(uuid)', $o$join private.ielts_speaking_sessions s on s.id = r.session_id and s.student_id = p_student$o$, sguard),
    ('private.ielts_batch_practice_source(uuid,uuid,text)', $o$where s.student_id=p_student and s.school_id=p_school and s.status='submitted'$o$, sguard),
    ('public.rpc_ielts_learning_allocate(uuid,uuid,text,uuid,text,timestamptz,uuid)', $o$where s.id=p_source and s.student_id=p_student and s.school_id=p_school and s.status='submitted'$o$, sguard)
  ) t(fn, old, add)
  loop
    d := pg_get_functiondef(r.fn::regprocedure);
    n := (length(d) - length(replace(d, r.old, ''))) / length(r.old);
    if n <> 1 then raise exception 'speaking mock reader guard: % expected text found % times', r.fn, n; end if;
    select proacl into acl from pg_proc where oid = r.fn::regprocedure;
    execute replace(d, r.old, r.old || r.add);
    -- CREATE OR REPLACE keeps owner and grants; confirm nothing changed.
    if (select proacl from pg_proc where oid = r.fn::regprocedure) is distinct from acl then
      raise exception 'speaking mock reader guard: % privileges changed', r.fn;
    end if;
  end loop;
end $mig$;
