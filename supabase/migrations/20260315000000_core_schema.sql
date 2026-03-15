-- ==============================================================================
-- CORE SCHEMA FOR OPERATIONAL DB (MINIMAL)
-- ==============================================================================
-- This migration contains ONLY the newly introduced objects for the 
-- new architecture.
-- 
-- The following entities are treated as external truth (already exist in DB):
--   - employees, roles, departments, locations, showroom_walkins, 
--     ivr_leads, car, vna_stock (view), matched_stock_customers (view)
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
    opty_status TEXT,
    opty_submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to enable idempotent upserts from the chatbot handoff.
CREATE UNIQUE INDEX IF NOT EXISTS ai_leads_source_conversation_id_key
  ON public.ai_leads (source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

-- Sent Messages Log: Tracking communications sent to leads
CREATE TABLE IF NOT EXISTS public.sent_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id TEXT,  -- Supports composite IDs (e.g., ai:uuid)
    tab TEXT,
    day_step INTEGER DEFAULT 1,
    ca_name TEXT,
    sent_by TEXT,
    status TEXT DEFAULT 'sent',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messaging Templates: Standard responses across different tabs
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tab TEXT,
    name TEXT,
    message TEXT,
    day_step INTEGER NOT NULL DEFAULT 1,
    ppl TEXT,
    attachments TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.ai_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. VIEWS (Unified Reporting Layer)
-- ==============================================================================

-- Pending Greenforms: e.g., AI Leads requesting a greenform but not yet submitted
CREATE OR REPLACE VIEW public.greenform_pending_leads AS
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
-- References existing tables: employees, showroom_walkins, ivr_leads
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
    sw.model_name,
    sw.model_name AS car_model,
    sw.model_name AS ppl,
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
    sw.updated_at,
    'walkin'::text AS lead_source,
    'walkin'::text AS source_pv
  FROM public.showroom_walkins sw
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
    ivr.updated_at,
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
    ai.updated_at,
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
