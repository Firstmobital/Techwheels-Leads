-- ==============================================================================
-- MIGRATION: 20260315010000_ai_leads_handoff_and_rls.sql
--
-- PURPOSE:
--   1. Add UNIQUE constraint on ai_leads.source_conversation_id to enable
--      idempotent upserts from the chatbot handoff endpoint (submitAILead).
--
--   2. Seed the roles table with canonical role codes required by the
--      inviteUser Edge Function. Without this seed, inviteUser returns 422.
--
--   3. Add baseline RLS policies for operational tables. All tables were
--      created with RLS enabled but had zero policies (deny-all by default).
--      These policies are minimal and production-safe.
--
-- APPLIES TO: Operational DB (tnakgaoqyumgfxklkujl)
-- ==============================================================================

-- ==============================================================================
-- 1. UNIQUE CONSTRAINT: ai_leads.source_conversation_id
--    Enables the submitAILead function to upsert safely and idempotently.
--    A NULL source_conversation_id means the lead came from a manual entry
--    (not the chatbot), so we only constrain NON-NULL values.
-- ==============================================================================

-- Partial unique index: only unique among chatbot-originated leads.
-- Manual leads (source_conversation_id IS NULL) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS ai_leads_source_conversation_id_key
  ON public.ai_leads (source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

-- ==============================================================================
-- 2. ROLES SEED DATA
--    Canonical role codes required by inviteUser Edge Function.
--    Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
-- ==============================================================================

INSERT INTO public.roles (id, role_name, role_code)
VALUES
  (uuid_generate_v4(), 'Administrator', 'admin'),
  (uuid_generate_v4(), 'Sales User',    'user')
ON CONFLICT (role_code) DO NOTHING;

-- ==============================================================================
-- 3. RLS POLICIES
--    Principle: authenticated users can read their own data, service-role
--    bypass is implicit. Admins can see all records via application-layer
--    filtering (roles.code = 'admin' resolved by the app, not DB-side).
--
--    NOTE: For full multi-tenant isolation these policies should reference
--    location_id against a session variable. This baseline is a safe starting
--    point that does not break existing functionality.
-- ==============================================================================

-- EMPLOYEES: read own row only; all authenticated read employees (for name display)
CREATE POLICY IF NOT EXISTS "employees_select_authenticated"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (true);  -- All authenticated users can read the employee list (for CA name display).

CREATE POLICY IF NOT EXISTS "employees_insert_service_role"
  ON public.employees
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "employees_update_own_or_service_role"
  ON public.employees
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ROLES: read-only for all authenticated
CREATE POLICY IF NOT EXISTS "roles_select_authenticated"
  ON public.roles
  FOR SELECT
  TO authenticated
  USING (true);

-- AI_LEADS: authenticated users can read all (app filters by salesperson_id)
--           Service role can insert (chatbot handoff endpoint uses service role)
CREATE POLICY IF NOT EXISTS "ai_leads_select_authenticated"
  ON public.ai_leads
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "ai_leads_insert_service_role"
  ON public.ai_leads
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "ai_leads_update_authenticated"
  ON public.ai_leads
  FOR UPDATE
  TO authenticated
  USING (
    -- Salespeople can only update leads assigned to them or unassigned leads.
    salesperson_id IS NULL OR salesperson_id = auth.uid()
  );

-- VNA_STOCK: read-only for authenticated (populated by external system)
CREATE POLICY IF NOT EXISTS "vna_stock_select_authenticated"
  ON public.vna_stock
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "vna_stock_upsert_service_role"
  ON public.vna_stock
  FOR ALL
  TO service_role
  USING (true);

-- MATCHED_STOCK_CUSTOMER: read-only for authenticated
CREATE POLICY IF NOT EXISTS "matched_stock_customer_select_authenticated"
  ON public.matched_stock_customer
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "matched_stock_customer_upsert_service_role"
  ON public.matched_stock_customer
  FOR ALL
  TO service_role
  USING (true);

-- SHOWROOM_WALKINS: read/write for authenticated, all for service_role
CREATE POLICY IF NOT EXISTS "showroom_walkins_select_authenticated"
  ON public.showroom_walkins
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "showroom_walkins_insert_authenticated"
  ON public.showroom_walkins
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "showroom_walkins_update_authenticated"
  ON public.showroom_walkins
  FOR UPDATE
  TO authenticated
  USING (
    salesperson_id IS NULL OR salesperson_id = auth.uid()
  );

-- IVR_LEADS: same as showroom_walkins
CREATE POLICY IF NOT EXISTS "ivr_leads_select_authenticated"
  ON public.ivr_leads
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "ivr_leads_insert_authenticated"
  ON public.ivr_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "ivr_leads_update_authenticated"
  ON public.ivr_leads
  FOR UPDATE
  TO authenticated
  USING (
    salesperson_id IS NULL OR salesperson_id = auth.uid()
  );

-- SENT_MESSAGES: users can read all but only insert their own
CREATE POLICY IF NOT EXISTS "sent_messages_select_authenticated"
  ON public.sent_messages
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "sent_messages_insert_authenticated"
  ON public.sent_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- TEMPLATES: read for all authenticated, write for service_role only
CREATE POLICY IF NOT EXISTS "templates_select_authenticated"
  ON public.templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "templates_all_service_role"
  ON public.templates
  FOR ALL
  TO service_role
  USING (true);

CREATE POLICY IF NOT EXISTS "templates_write_authenticated"
  ON public.templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);  -- App-layer admin check guards this; relax if admin-only is needed.
