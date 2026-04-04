ALTER TABLE public.walkin_followup_calls
ADD COLUMN IF NOT EXISTS lead_source text DEFAULT 'walkin';

ALTER TABLE public.walkin_followup_calls
ADD COLUMN IF NOT EXISTS source_record_id text;

UPDATE public.walkin_followup_calls
SET source_record_id = walkin_id::text, lead_source = 'walkin'
WHERE walkin_id IS NOT NULL AND source_record_id IS NULL;

ALTER TABLE public.walkin_followup_calls
DROP CONSTRAINT IF EXISTS walkin_followup_calls_verdict_check;

ALTER TABLE public.walkin_followup_calls
ADD CONSTRAINT walkin_followup_calls_verdict_check CHECK (
  verdict = ANY (ARRAY[
    'very_interested','needs_info','not_reachable','call_later',
    'needs_discount','escalate','booked','not_interested',
    'interested','callback','already_billed'
  ])
);

ALTER TABLE public.sent_messages
ADD COLUMN IF NOT EXISTS outcome text,
ADD COLUMN IF NOT EXISTS remark text;

ALTER TABLE public.sent_messages
DROP CONSTRAINT IF EXISTS sent_messages_lead_source_check;

ALTER TABLE public.sent_messages
ADD CONSTRAINT sent_messages_lead_source_check CHECK (
  lead_source = ANY (ARRAY['walkin','ivr','ai','vna','matchtalk','greenforms'])
);