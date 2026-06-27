-- Add privacy-safe attribution and location fields for IELTS funnel analytics.
alter table public.ielts_funnel_events
  add column if not exists country_code text null,
  add column if not exists country_name text null,
  add column if not exists region text null,
  add column if not exists city text null,
  add column if not exists timezone text null,
  add column if not exists referrer text null,
  add column if not exists landing_page text null,
  add column if not exists utm_source text null,
  add column if not exists utm_medium text null,
  add column if not exists utm_campaign text null,
  add column if not exists utm_content text null,
  add column if not exists utm_term text null,
  add column if not exists event_idempotency_key text null;

create index if not exists ielts_funnel_events_session_idx on public.ielts_funnel_events (session_id) where session_id is not null;
create index if not exists ielts_funnel_events_country_idx on public.ielts_funnel_events (country_code) where country_code is not null;
create index if not exists ielts_funnel_events_utm_source_idx on public.ielts_funnel_events (utm_source) where utm_source is not null;
create index if not exists ielts_funnel_events_utm_campaign_idx on public.ielts_funnel_events (utm_campaign) where utm_campaign is not null;
create unique index if not exists ielts_funnel_events_idempotency_uidx
  on public.ielts_funnel_events (event_idempotency_key)
  where event_idempotency_key is not null;
