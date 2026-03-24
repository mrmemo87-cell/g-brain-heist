-- Reward event idempotency ledger for event-bound reward APIs.

CREATE TABLE IF NOT EXISTS public.reward_event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_type, event_id),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reward_event_receipts_user_created
  ON public.reward_event_receipts(user_id, created_at DESC);

ALTER TABLE public.reward_event_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reward_event_receipts_owner_select ON public.reward_event_receipts;
CREATE POLICY reward_event_receipts_owner_select
  ON public.reward_event_receipts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS reward_event_receipts_owner_insert ON public.reward_event_receipts;
CREATE POLICY reward_event_receipts_owner_insert
  ON public.reward_event_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
