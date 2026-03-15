-- ==============================================================================
-- CORE SCHEMA FOR OPERATIONAL DB (MINIMAL)
-- ==============================================================================
-- This migration contains ONLY the newly introduced objects for the 
-- new architecture.
-- 
-- The following entities are treated as external truth (already exist in DB):
--   - employees (id: bigint, auth_user_id: uuid, first_name: not null)
--   - roles, departments, locations
--   - showroom_walkins (uses car_id, no updated_at)
--   - ivr_leads (no updated_at)
--   - car
--   - vna_stock (view), matched_stock_customers (view)
-- ==============================================================================

-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABLES
-- ==============================================================================

-- AI Leads: Captured from chatbot conversations
CREATE TABLE IF NOT EXISTS public.ai_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT,
    mobile_number TEXT,
    model_name TEXT,
    salesperson_id BIGINT,
    location_id BIGINT,
    source_conversation_id TEXT,
    remarks TEXT,
    greenform_requested BOOLEAN DEFAULT false,
    opty_id TEXT,
    opty_status TEXT DEFAULT 'pending',
    opty_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to enable idempotent upserts from the chatbot handoff.
CREATE UNIQUE INDEX IF NOT EXISTS ai_leads_source_conversation_id_key
  ON public.ai_leads (source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

-- Messaging Templates
CREATE TABLE IF NOT EXISTS public.templates (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    category text NULL,
    channel text NOT NULL DEFAULT 'whatsapp',
    language text NOT NULL DEFAULT 'en',
    template_text text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sent Messages Log
CREATE TABLE IF NOT EXISTS public.sent_messages (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_name text NULL,
    mobile_number text NOT NULL,
    message_text text NULL,
    template_id bigint NULL REFERENCES public.templates(id) ON DELETE SET NULL,
    lead_source text NULL CHECK (lead_source IN ('walkin', 'ivr', 'ai')),
    source_record_id uuid NULL,
    sent_by_employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    sent_via text NOT NULL DEFAULT 'whatsapp_link',
    status text NOT NULL DEFAULT 'sent',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. VIEWS (Unified Reporting Layer)
-- ==============================================================================

-- Pending Greenforms: Unifies Showroom Walk-ins, IVR, and AI Leads
CREATE OR REPLACE VIEW public.greenform_pending_leads AS
SELECT
    'walkin'::text AS source_type,
    sw.id::text AS source_record_id,
    ('walkin:' || sw.id::text) AS id,
    sw.customer_name,
    sw.mobile_number,
    c.name AS model_name,
    sw.salesperson_id,
    sw.location_id,
    sw.opty_id,
    sw.opty_status,
    sw.opty_submitted_at,
    true AS greenform_requested,
    sw.created_at,
    sw.created_at AS updated_at
FROM public.showroom_walkins sw
LEFT JOIN public.car c ON c.id = sw.car_id
WHERE (sw.opty_id IS NULL OR btrim(sw.opty_id) = '')
  AND lower(btrim(COALESCE(sw.opty_status, ''))) != 'submitted'

UNION ALL

SELECT
    'ivr'::text AS source_type,
    ivr.id::text AS source_record_id,
    ('ivr:' || ivr.id::text) AS id,
    ivr.customer_name,
    ivr.mobile_number,
    ivr.model_name,
    ivr.salesperson_id,
    ivr.location_id,
    ivr.opty_id,
    ivr.opty_status,
    ivr.opty_submitted_at,
    true AS greenform_requested,
    ivr.created_at,
    ivr.created_at AS updated_at
FROM public.ivr_leads ivr
WHERE (ivr.opty_id IS NULL OR btrim(ivr.opty_id) = '')
  AND lower(btrim(COALESCE(ivr.opty_status, ''))) != 'submitted'

UNION ALL

SELECT
    'ai'::text AS source_type,
    al.id::text AS source_record_id,
    ('ai:' || al.id::text) AS id,
    al.customer_name,
    al.mobile_number,
    al.model_name,
    al.salesperson_id,
    al.location_id,
    al.opty_id,
    al.opty_status,
    al.opty_submitted_at,
    al.greenform_requested,
    al.created_at,
    al.updated_at
FROM public.ai_leads al
WHERE al.greenform_requested = true
  AND (al.opty_id IS NULL OR btrim(al.opty_id) = '')
  AND lower(btrim(COALESCE(al.opty_status, ''))) != 'submitted';

-- Submitted Greenforms: Unified view across Walk-ins, IVR, and AI pipelines
CREATE OR REPLACE VIEW public.greenform_submitted_leads AS
WITH employee_names AS (
  SELECT
    e.id AS employee_id,
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
    c.name AS model_name,
    c.name AS car_model,
    c.name AS ppl,
    sw.salesperson_id,
    sw.salesperson_id::text AS assigned_to,
    sw.location_id,
    en.employee_full_name,
    en.employee_full_name AS ca_name,
    sw.opty_id,
    lower(btrim(sw.opty_status)) AS opty_status,
    sw.opty_submitted_at,
    sw.created_at,
    sw.created_at AS created_date,
    true AS greenform_requested,
    'walkin'::text AS lead_source,
    'walkin'::text AS source_pv
  FROM public.showroom_walkins sw
  LEFT JOIN public.car c ON c.id = sw.car_id
  LEFT JOIN employee_names en ON en.employee_id = sw.salesperson_id
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
    ivr.salesperson_id,
    ivr.salesperson_id::text AS assigned_to,
    ivr.location_id,
    en.employee_full_name,
    en.employee_full_name AS ca_name,
    ivr.opty_id,
    lower(btrim(ivr.opty_status)) AS opty_status,
    ivr.opty_submitted_at,
    ivr.created_at,
    ivr.created_at AS created_date,
    true AS greenform_requested,
    'ivr'::text AS lead_source,
    'ivr'::text AS source_pv
  FROM public.ivr_leads ivr
  LEFT JOIN employee_names en ON en.employee_id = ivr.salesperson_id
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
    ai.salesperson_id,
    ai.salesperson_id::text AS assigned_to,
    ai.location_id,
    en.employee_full_name,
    en.employee_full_name AS ca_name,
    ai.opty_id,
    lower(btrim(ai.opty_status)) AS opty_status,
    ai.opty_submitted_at,
    ai.created_at,
    ai.created_at AS created_date,
    ai.greenform_requested,
    'ai'::text AS lead_source,
    'ai'::text AS source_pv
  FROM public.ai_leads ai
  LEFT JOIN employee_names en ON en.employee_id = ai.salesperson_id
  WHERE NULLIF(btrim(ai.opty_id), '') IS NOT NULL
    AND lower(btrim(ai.opty_status)) = 'submitted'
)
SELECT * FROM submitted_showroom_walkins
UNION ALL
SELECT * FROM submitted_ivr_leads
UNION ALL
SELECT * FROM submitted_ai_leads;

-- ==============================================================================
-- 3. RLS POLICIES
-- ==============================================================================

-- AI_LEADS
CREATE POLICY "ai_leads_select_authenticated"
  ON public.ai_leads FOR SELECT TO authenticated USING (true);

CREATE POLICY "ai_leads_insert_service_role"
  ON public.ai_leads FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "ai_leads_update_authenticated"
  ON public.ai_leads FOR UPDATE TO authenticated USING (
    salesperson_id IS NULL OR 
    EXISTS (
      SELECT 1 FROM employees e 
      WHERE e.id = ai_leads.salesperson_id 
      AND e.auth_user_id = auth.uid()
    )
  );

-- SENT_MESSAGES
CREATE POLICY "sent_messages_select_authenticated"
  ON public.sent_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "sent_messages_insert_authenticated"
  ON public.sent_messages FOR INSERT TO authenticated WITH CHECK (true);

-- TEMPLATES
CREATE POLICY "templates_select_authenticated"
  ON public.templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "templates_all_service_role"
  ON public.templates FOR ALL TO service_role USING (true);

CREATE POLICY "templates_write_authenticated"
  ON public.templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
