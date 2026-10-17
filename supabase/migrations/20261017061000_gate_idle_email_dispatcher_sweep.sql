-- 2026-10-17 classroom runtime overhead reduction (part 2 of 2).
--
-- The once-a-minute 'school-email-dispatcher' cron sweep invoked the
-- school_email_dispatcher Edge Function unconditionally. Each invocation makes
-- ~4 PostgREST requests (config read + three claim RPCs) even when nothing is
-- queued. On 2026-10-15/16 this idle sweep was ~45% of all API traffic and kept
-- PostgREST connections busy during classes.
--
-- The Edge Function's only work is: claim due rows from the three queues and
-- deliver them. We now call it only when at least one of those claim RPCs would
-- have claimed (or, for assignment emails, retired) a row. The predicates below
-- are copied from the claim functions:
--   public.rpc_claim_assignment_email_notifications        (incl. attempts>=5 retire step)
--   public.rpc_claim_guardian_invitation_email_notifications
--   public.rpc_claim_transactional_email_outbox
-- Same schedule, same URL/headers/body/timeout. The immediate-send statement
-- triggers (public.trg_kick_school_email_dispatcher) are unchanged.
-- If a claim function's predicate is ever widened, update this gate too.
select cron.schedule(
  'school-email-dispatcher',
  '* * * * *',
  $cron$select net.http_post(
    url := (select function_url from public.school_email_dispatch_config where singleton=true),
    headers := jsonb_build_object('Content-Type','application/json',
      'x-school-email-dispatch-key',(select dispatch_key from public.school_email_dispatch_config where singleton=true)),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )
  where exists (
      select 1 from public.assignment_email_notifications q
      where q.status = 'pending'
        and (q.attempts >= 5
             or (q.available_at <= now()
                 and coalesce(q.next_attempt_at, q.available_at) <= now()))
    )
    or exists (
      select 1 from public.guardian_invitation_email_notifications q
      where q.status = 'pending'
        and q.available_at <= now()
        and coalesce(q.next_attempt_at, q.available_at) <= now()
    )
    or exists (
      select 1 from public.transactional_email_outbox q
      where q.status in ('pending','delayed')
        and q.available_at <= now()
        and coalesce(q.next_attempt_at, q.available_at) <= now()
    );$cron$
);

-- Rollback (restores the unconditional sweep exactly):
-- select cron.schedule('school-email-dispatcher','* * * * *',
--   $cron$select net.http_post(
--     url := (select function_url from public.school_email_dispatch_config where singleton=true),
--     headers := jsonb_build_object('Content-Type','application/json',
--       'x-school-email-dispatch-key',(select dispatch_key from public.school_email_dispatch_config where singleton=true)),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 20000
--   );$cron$);
