-- Idempotent delivery ledger for verified school-request lifecycle emails.
-- Email content and recipient resolution remain server-side in the Edge Function.
create table if not exists public.school_request_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.school_requests(id) on delete cascade,
  event_key text not null,
  event_type text not null check (
    event_type in ('submitted', 'needs_more_info', 'approved', 'rejected', 'duplicate')
  ),
  recipient_email text not null,
  status text not null default 'pending' check (
    status in ('pending', 'sending', 'sent', 'failed')
  ),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (request_id, event_key)
);

comment on table public.school_request_email_deliveries is
  'Service-only audit and idempotency ledger for verified school-request lifecycle email delivery.';

create index if not exists school_request_email_deliveries_status_idx
  on public.school_request_email_deliveries(status, updated_at desc);

alter table public.school_request_email_deliveries enable row level security;
revoke all on table public.school_request_email_deliveries from public, anon, authenticated;
grant select, insert, update on table public.school_request_email_deliveries to service_role;
