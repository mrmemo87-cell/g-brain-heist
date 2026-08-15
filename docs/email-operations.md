# Brains Heist transactional email operations

All application-managed transactional email is sent from Supabase Edge
Functions through Resend. Every HTML template uses the shared renderer in
`supabase/functions/_shared/email.ts` and displays:

1. the school logo from `public.schools.logo_url` (or a school-name monogram
   when the school has not uploaded a logo); and
2. the official Brains Heist logo from
   `https://www.brainsheist.com/logo.png`.

The product name is always **Brains Heist**.

## Required Edge Function secrets

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `SCHOOL_EMAIL_FROM` — for example
  `Brains Heist Schools <notifications@brainsheist.com>`
- `SCHOOL_EMAIL_REPLY_TO`
- `SCHOOL_EMAIL_APP_URL=https://www.brainsheist.com`
- `PLATFORM_ALERT_EMAIL` — the operational inbox for platform-owner alerts
- `NEW_USER_EMAIL_HOOK_SECRET`

Legacy `SCHOOL_REQUEST_EMAIL_FROM`, `SCHOOL_REQUEST_REPLY_TO`,
`NEW_USER_EMAIL_FROM`, and `NEW_USER_ALERT_TO` remain compatible during
rollout, but the canonical variables above should be used.

Do not use a personal email address as a source-code fallback.

## Resend webhook

Create one Resend webhook pointing to:

`https://sozodkxwhubespiedgxm.supabase.co/functions/v1/resend_webhook`

Subscribe to:

- `email.sent`
- `email.delivered`
- `email.delivery_delayed`
- `email.bounced`
- `email.complained`
- `email.suppressed`
- `email.failed`

Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`. The function
verifies the raw-body Svix signature and rejects timestamps older than five
minutes. It records each provider event once, updates the delivery ledger, and
suppresses addresses after a bounce, complaint, or provider suppression.

## Status semantics

- `accepted`: Resend accepted the API request; inbox delivery is not proven.
- `delivered`: the recipient mail server accepted the message.
- `delayed`: delivery is temporarily delayed.
- `bounced`, `complained`, `suppressed`, or `failed`: final operational
  attention is required.

User-facing copy must never describe `accepted` as delivered.

## Queue operations

The `school-email-dispatcher` cron runs once per minute. It:

1. recovers claims left in `processing` for more than ten minutes;
2. creates idempotent assignment, guardian, and renewal reminders;
3. invokes `school_email_dispatcher`;
4. claims work with `FOR UPDATE SKIP LOCKED`;
5. retries temporary failures up to five times with exponential backoff.

The superadmin-only `rpc_email_operations_snapshot()` returns aggregate queue
health without recipient addresses or message payloads.

## Privacy rules

- Resolve registered recipients through verified Supabase Auth email.
- Do not place marks, bands, answers, weaknesses, private notes, evidence, or
  reusable access codes in email.
- Link recipients to authenticated pages for private details.
- Store provider-event recipient identifiers only as SHA-256 hashes.
- Keep queue and provider-event tables service-only with RLS enabled.
