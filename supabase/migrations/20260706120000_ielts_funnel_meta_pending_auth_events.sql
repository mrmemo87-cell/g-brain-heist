-- Add Meta dedupe support and post-diagnostic auth events without weakening RLS.
alter table public.ielts_funnel_events
  add column if not exists event_idempotency_key text null;

create unique index if not exists ielts_funnel_events_event_idempotency_key_uidx
  on public.ielts_funnel_events (event_idempotency_key)
  where event_idempotency_key is not null;

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
    'auth_required_for_result',
    'diagnostic_completed_pending_auth',
    'diagnostic_saved_after_auth',
    'funnel_error'
  ));
