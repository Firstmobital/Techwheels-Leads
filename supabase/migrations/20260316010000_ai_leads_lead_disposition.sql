-- Add AI lead disposition for actionable AI Leads filtering.
ALTER TABLE public.ai_leads
ADD COLUMN IF NOT EXISTS lead_disposition text DEFAULT 'active';

UPDATE public.ai_leads
SET lead_disposition = 'active'
WHERE lead_disposition IS NULL OR btrim(lead_disposition) = '';

ALTER TABLE public.ai_leads
ALTER COLUMN lead_disposition SET DEFAULT 'active';

ALTER TABLE public.ai_leads
ALTER COLUMN lead_disposition SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_leads_lead_disposition_check'
      AND conrelid = 'public.ai_leads'::regclass
  ) THEN
    ALTER TABLE public.ai_leads
    ADD CONSTRAINT ai_leads_lead_disposition_check
    CHECK (lead_disposition IN ('active', 'interested', 'uninterested'));
  END IF;
END $$;
