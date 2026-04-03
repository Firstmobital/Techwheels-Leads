-- Walk-in follow-up tracking

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.showroom_walkins
  ADD COLUMN IF NOT EXISTS model_segment TEXT
    CHECK (model_segment IN ('EV', 'Premium SUV', 'Others'));

ALTER TABLE public.showroom_walkins
  ADD COLUMN IF NOT EXISTS followup_status TEXT DEFAULT 'pending'
    CHECK (followup_status IN ('pending', 'called', 'booked', 'not_interested', 'lost', 'escalated'));

ALTER TABLE public.showroom_walkins
  ADD COLUMN IF NOT EXISTS next_call_date DATE;

ALTER TABLE public.showroom_walkins
  ADD COLUMN IF NOT EXISTS last_verdict TEXT;

CREATE TABLE IF NOT EXISTS public.walkin_followup_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  walkin_id UUID REFERENCES public.showroom_walkins(id) ON DELETE CASCADE,
  caller_id UUID REFERENCES auth.users(id),
  verdict TEXT NOT NULL
    CHECK (verdict IN ('very_interested', 'needs_info', 'not_reachable', 'call_later', 'needs_discount', 'escalate', 'booked', 'not_interested')),
  notes TEXT,
  next_call_date DATE,
  escalate_to_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.walkin_followup_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY walkin_followup_calls_select_authenticated
ON public.walkin_followup_calls
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY walkin_followup_calls_insert_authenticated
ON public.walkin_followup_calls
FOR INSERT
TO authenticated
WITH CHECK (true);
