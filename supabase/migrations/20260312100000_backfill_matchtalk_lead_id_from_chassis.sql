-- Backfill lead_id for MatchTalk rows that only have chassis number.
-- Keeps existing lead_id values intact and only fills missing ones.

BEGIN;

UPDATE public.matchtalk_leads
SET lead_id = COALESCE(
  CASE WHEN NULLIF(btrim(chassis_no), '') IS NOT NULL THEN 'MatchTalkLead:chassis_no:' || lower(btrim(chassis_no)) END,
  CASE WHEN NULLIF(btrim(vc_number), '') IS NOT NULL THEN 'MatchTalkLead:vc_number:' || lower(btrim(vc_number)) END,
  CASE WHEN NULLIF(btrim(opty_id), '') IS NOT NULL THEN 'MatchTalkLead:opty_id:' || lower(btrim(opty_id)) END,
  CASE WHEN NULLIF(btrim(phone_number), '') IS NOT NULL THEN 'MatchTalkLead:phone_number:' || lower(btrim(phone_number)) END
)
WHERE lead_id IS NULL;

COMMIT;
