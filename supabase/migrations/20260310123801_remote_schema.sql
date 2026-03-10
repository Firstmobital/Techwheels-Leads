-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. PROFILES TABLE & AUTH HOOK
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE,
    role TEXT DEFAULT 'user',
    ca_names TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper Functions for RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_ca_names()
RETURNS TEXT[] AS $$
  SELECT ca_names FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS TEXT AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;


-- Automate Profile Creation on Sign Up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, ca_names)
  VALUES (new.id, new.email, 'user', '{}');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Updated_at Trigger Helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==============================================================================
-- 2. VANA LEADS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.vana_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id TEXT,
    chassis_no TEXT,
    ppl TEXT,
    pl TEXT,
    colour TEXT,
    ca_name TEXT,
    opty_id TEXT UNIQUE,
    customer_name TEXT,
    vc_number TEXT,
    yf_open_date TEXT,
    phone_number TEXT,
    branch TEXT,
    tl_name TEXT,
    allocation_status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_vana_leads_updated_at
BEFORE UPDATE ON public.vana_leads
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ==============================================================================
-- 3. MATCHTALK LEADS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.matchtalk_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chassis_no TEXT,
    ppl TEXT,
    pl TEXT,
    colour TEXT,
    ca_name TEXT,
    customer_name TEXT,
    phone_number TEXT UNIQUE,
    no_status TEXT,
    vc_number TEXT,
    opty_id TEXT,
    finance_remark TEXT,
    wa_1 TEXT,
    wa_2 TEXT,
    next_message_date TEXT,
    wa_v1 TEXT,
    wa_v2 TEXT,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_matchtalk_leads_updated_at
BEFORE UPDATE ON public.matchtalk_leads
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ==============================================================================
-- 4. GREENFORM LEADS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.greenform_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ppl TEXT,
    source_pv TEXT,
    phone_number TEXT,
    employee_full_name TEXT,
    sales_stage TEXT,
    customer_name TEXT,
    opportunity_name TEXT UNIQUE,
    tl_name TEXT,
    branch TEXT,
    total_offers TEXT,
    ev_or_pv TEXT,
    month TEXT,
    wa_1 TEXT,
    wa_2 TEXT,
    wa_3 TEXT,
    wa_4 TEXT,
    next_message_date TEXT,
    wa_v1 TEXT,
    wa_v2 TEXT,
    wa_v3 TEXT,
    wa_v4 TEXT,
    remarks TEXT,
    mtd TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_greenform_leads_updated_at
BEFORE UPDATE ON public.greenform_leads
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ==============================================================================
-- 5. AI GENERATED LEADS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.ai_generated_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_name TEXT,
    phone_number TEXT UNIQUE,
    car_of_interest TEXT,
    chat_details TEXT,
    status TEXT DEFAULT 'New',
    is_assigned BOOLEAN DEFAULT false,
    assigned_to TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_ai_generated_leads_updated_at
BEFORE UPDATE ON public.ai_generated_leads
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ==============================================================================
-- 6. SENT MESSAGES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sent_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id TEXT,
    tab TEXT,
    day_step INTEGER DEFAULT 1,
    ca_name TEXT,
    sent_by TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER update_sent_messages_updated_at
BEFORE UPDATE ON public.sent_messages
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

-- ==============================================================================
-- 7. TEMPLATES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tab TEXT,
    label TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TRIGGER update_templates_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- ==============================================================================
-- 8. INDEXES FOR PERFORMANCE AND SEARCHING
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_vana_phone ON public.vana_leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_vana_opty ON public.vana_leads(opty_id);
CREATE INDEX IF NOT EXISTS idx_vana_vc ON public.vana_leads(vc_number);

CREATE INDEX IF NOT EXISTS idx_matchtalk_phone ON public.matchtalk_leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_matchtalk_opty ON public.matchtalk_leads(opty_id);
CREATE INDEX IF NOT EXISTS idx_matchtalk_vc ON public.matchtalk_leads(vc_number);

CREATE INDEX IF NOT EXISTS idx_greenform_phone ON public.greenform_leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_greenform_opp ON public.greenform_leads(opportunity_name);

CREATE INDEX IF NOT EXISTS idx_ai_phone ON public.ai_generated_leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_ai_assigned ON public.ai_generated_leads(assigned_to);


-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.vana_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchtalk_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.greenform_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generated_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;


-- Profile Policies
CREATE POLICY "Users can read their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins can update profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin());

-- Vana Leads Policies
CREATE POLICY "Admins full access vana_leads" ON public.vana_leads FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Sales can read assigned vana_leads" ON public.vana_leads FOR SELECT TO authenticated USING (ca_name = ANY(public.get_user_ca_names()));

-- MatchTalk Leads Policies
CREATE POLICY "Admins full access matchtalk_leads" ON public.matchtalk_leads FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Sales can read assigned matchtalk_leads" ON public.matchtalk_leads FOR SELECT TO authenticated USING (ca_name = ANY(public.get_user_ca_names()));

-- Greenform Leads Policies
CREATE POLICY "Admins full access greenform_leads" ON public.greenform_leads FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Sales can read assigned greenform_leads" ON public.greenform_leads FOR SELECT TO authenticated USING (employee_full_name = ANY(public.get_user_ca_names()));

-- AI Generated Leads Policies
CREATE POLICY "Admins full access ai_generated_leads" ON public.ai_generated_leads FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Sales can read unassigned AI leads" ON public.ai_generated_leads FOR SELECT TO authenticated USING (is_assigned = false);
CREATE POLICY "Sales can read their assigned AI leads" ON public.ai_generated_leads FOR SELECT TO authenticated USING (assigned_to = public.get_user_email());

-- Sent Messages Policies
CREATE POLICY "Admins full access sent_messages" ON public.sent_messages FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Sales can read sent_messages" ON public.sent_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales can create sent_messages" ON public.sent_messages FOR INSERT TO authenticated WITH CHECK (sent_by = public.get_user_email());

-- Templates Policies
CREATE POLICY "Admins full access templates" ON public.templates FOR ALL TO authenticated USING (public.is_admin());
CREATE POLICY "Sales can read templates" ON public.templates FOR SELECT TO authenticated USING (true);
