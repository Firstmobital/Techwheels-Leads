-- Phase 4 Step 1: unified submitted Green Forms source for web runtime migration.
-- Business rule enforced at source:
--   1) opty_id is present (not null / not empty)
--   2) opty_status = 'submitted' (case-insensitive)

BEGIN;

CREATE OR REPLACE VIEW public.greenform_submitted_leads AS
WITH employee_names AS (
  SELECT
    e.id::text AS employee_id,
    NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), '') AS employee_full_name
  FROM public.employees e
),
submitted_showroom_walkins AS (
  SELECT
    'walkin'::text AS source_type,
    sw.id::text AS source_record_id,
    ('walkin:' || sw.id::text) AS id,

    sw.customer_name,
    sw.mobile_number,
    sw.mobile_number AS phone_number,
    sw.model_name,
    sw.model_name AS car_model,
    sw.model_name AS ppl,

    sw.salesperson_id::text AS salesperson_id,
    sw.salesperson_id::text AS assigned_to,
    sw.location_id::text AS location_id,

    en.employee_full_name,
    en.employee_full_name AS ca_name,

    sw.opty_id,
    lower(btrim(sw.opty_status)) AS opty_status,
    sw.opty_submitted_at,
    sw.greenform_requested,

    sw.created_at,
    sw.created_at AS created_date,
    sw.updated_at,

    'walkin'::text AS lead_source,
    'walkin'::text AS source_pv
  FROM public.showroom_walkins sw
  LEFT JOIN employee_names en
    ON en.employee_id = sw.salesperson_id::text
  WHERE NULLIF(btrim(sw.opty_id), '') IS NOT NULL
    AND lower(btrim(sw.opty_status)) = 'submitted'
),
submitted_ivr_leads AS (
  SELECT
    'ivr'::text AS source_type,
    ivr.id::text AS source_record_id,
    ('ivr:' || ivr.id::text) AS id,

    ivr.customer_name,
    ivr.mobile_number,
    ivr.mobile_number AS phone_number,
    ivr.model_name,
    ivr.model_name AS car_model,
    ivr.model_name AS ppl,

    ivr.salesperson_id::text AS salesperson_id,
    ivr.salesperson_id::text AS assigned_to,
    ivr.location_id::text AS location_id,

    en.employee_full_name,
    en.employee_full_name AS ca_name,

    ivr.opty_id,
    lower(btrim(ivr.opty_status)) AS opty_status,
    ivr.opty_submitted_at,
    ivr.greenform_requested,

    ivr.created_at,
    ivr.created_at AS created_date,
    ivr.updated_at,

    'ivr'::text AS lead_source,
    'ivr'::text AS source_pv
  FROM public.ivr_leads ivr
  LEFT JOIN employee_names en
    ON en.employee_id = ivr.salesperson_id::text
  WHERE NULLIF(btrim(ivr.opty_id), '') IS NOT NULL
    AND lower(btrim(ivr.opty_status)) = 'submitted'
),
submitted_ai_leads AS (
  SELECT
    'ai'::text AS source_type,
    ai.id::text AS source_record_id,
    ('ai:' || ai.id::text) AS id,

    ai.customer_name,
    ai.mobile_number,
    ai.mobile_number AS phone_number,
    ai.model_name,
    ai.model_name AS car_model,
    ai.model_name AS ppl,

    ai.salesperson_id::text AS salesperson_id,
    ai.salesperson_id::text AS assigned_to,
    ai.location_id::text AS location_id,

    en.employee_full_name,
    en.employee_full_name AS ca_name,

    ai.opty_id,
    lower(btrim(ai.opty_status)) AS opty_status,
    ai.opty_submitted_at,
    ai.greenform_requested,

    ai.created_at,
    ai.created_at AS created_date,
    ai.updated_at,

    'ai'::text AS lead_source,
    'ai'::text AS source_pv
  FROM public.ai_leads ai
  LEFT JOIN employee_names en
    ON en.employee_id = ai.salesperson_id::text
  WHERE NULLIF(btrim(ai.opty_id), '') IS NOT NULL
    AND lower(btrim(ai.opty_status)) = 'submitted'
)
SELECT * FROM submitted_showroom_walkins
UNION ALL
SELECT * FROM submitted_ivr_leads
UNION ALL
SELECT * FROM submitted_ai_leads;

COMMENT ON VIEW public.greenform_submitted_leads IS
'Unified submitted Green Form leads from showroom_walkins, ivr_leads, and ai_leads for Phase 4 web migration.';

COMMIT;
