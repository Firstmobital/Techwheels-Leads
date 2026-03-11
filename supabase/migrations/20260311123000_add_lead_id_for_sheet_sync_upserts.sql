-- Add lead_id to lead tables so syncFromSheets can use onConflict: lead_id.

BEGIN;

ALTER TABLE public.vana_leads ADD COLUMN IF NOT EXISTS lead_id TEXT;
ALTER TABLE public.matchtalk_leads ADD COLUMN IF NOT EXISTS lead_id TEXT;
ALTER TABLE public.greenform_leads ADD COLUMN IF NOT EXISTS lead_id TEXT;

-- Backfill lead_id in a deterministic format used by the edge function.
UPDATE public.vana_leads
SET lead_id = COALESCE(
  lead_id,
  CASE WHEN NULLIF(btrim(opty_id), '') IS NOT NULL THEN 'VanaLead:opty_id:' || lower(btrim(opty_id)) END,
  CASE WHEN NULLIF(btrim(vc_number), '') IS NOT NULL THEN 'VanaLead:vc_number:' || lower(btrim(vc_number)) END,
  CASE WHEN NULLIF(btrim(phone_number), '') IS NOT NULL THEN 'VanaLead:phone_number:' || lower(btrim(phone_number)) END
)
WHERE lead_id IS NULL;

UPDATE public.matchtalk_leads
SET lead_id = COALESCE(
  lead_id,
  CASE WHEN NULLIF(btrim(vc_number), '') IS NOT NULL THEN 'MatchTalkLead:vc_number:' || lower(btrim(vc_number)) END,
  CASE WHEN NULLIF(btrim(opty_id), '') IS NOT NULL THEN 'MatchTalkLead:opty_id:' || lower(btrim(opty_id)) END,
  CASE WHEN NULLIF(btrim(phone_number), '') IS NOT NULL THEN 'MatchTalkLead:phone_number:' || lower(btrim(phone_number)) END
)
WHERE lead_id IS NULL;

UPDATE public.greenform_leads
SET lead_id = COALESCE(
  lead_id,
  CASE WHEN NULLIF(btrim(opportunity_name), '') IS NOT NULL THEN 'GreenFormLead:opportunity_name:' || lower(btrim(opportunity_name)) END,
  CASE WHEN NULLIF(btrim(phone_number), '') IS NOT NULL THEN 'GreenFormLead:phone_number:' || lower(btrim(phone_number)) END
)
WHERE lead_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS vana_leads_lead_id_unique ON public.vana_leads(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS matchtalk_leads_lead_id_unique ON public.matchtalk_leads(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS greenform_leads_lead_id_unique ON public.greenform_leads(lead_id);

COMMIT;
