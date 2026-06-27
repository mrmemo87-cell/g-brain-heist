-- Allow the new privacy-safe IELTS dashboard funnel events without deleting analytics history.
do $$
begin
  if to_regclass('public.ielts_funnel_events') is not null then
    alter table public.ielts_funnel_events
      drop constraint if exists ielts_funnel_events_event_name_check;

    alter table public.ielts_funnel_events
      add constraint ielts_funnel_events_event_name_check check (event_name in (
        'landing_view',
        'start_free_assessment_click',
        'auth_required_for_diagnostic',
        'diagnostic_started',
        'diagnostic_completed',
        'result_viewed',
        'dashboard_viewed',
        'prime_dashboard_viewed',
        'diagnostic_retake_blocked',
        'prime_upsell_click',
        'checkout_started',
        'checkout_opened',
        'checkout_completed',
        'subscription_activated',
        'funnel_error'
      ));
  end if;
end $$;
