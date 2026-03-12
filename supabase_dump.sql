


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_user_ca_names"() RETURNS "text"[]
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT ca_names FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_ca_names"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_email"() RETURNS "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT email FROM public.profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, ca_names)
  VALUES (new.id, new.email, new.email, 'user', '{}');
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_created_updated_dates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    NEW.created_at := COALESCE(NEW.created_at, NEW.created_date, NOW());
    NEW.updated_at := COALESCE(NEW.updated_at, NEW.updated_date, NOW());

    NEW.created_date := NEW.created_at;
    NEW.updated_date := NEW.updated_at;

    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Keep created timestamps immutable.
    NEW.created_at := OLD.created_at;
    NEW.created_date := OLD.created_date;

    -- Always bump updated timestamps.
    NEW.updated_at := NOW();
    NEW.updated_date := NEW.updated_at;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_created_updated_dates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_generated_leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_name" "text",
    "phone_number" "text",
    "car_of_interest" "text",
    "chat_details" "text",
    "status" "text" DEFAULT 'New'::"text",
    "is_assigned" boolean DEFAULT false,
    "assigned_to" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_date" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_generated_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."greenform_leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "ppl" "text",
    "source_pv" "text",
    "phone_number" "text",
    "employee_full_name" "text",
    "sales_stage" "text",
    "customer_name" "text",
    "opportunity_name" "text",
    "tl_name" "text",
    "branch" "text",
    "total_offers" "text",
    "ev_or_pv" "text",
    "month" "text",
    "wa_1" "text",
    "wa_2" "text",
    "wa_3" "text",
    "wa_4" "text",
    "next_message_date" "text",
    "wa_v1" "text",
    "wa_v2" "text",
    "wa_v3" "text",
    "wa_v4" "text",
    "remarks" "text",
    "mtd" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lead_id" "text"
);


ALTER TABLE "public"."greenform_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matchtalk_leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chassis_no" "text",
    "ppl" "text",
    "pl" "text",
    "colour" "text",
    "ca_name" "text",
    "customer_name" "text",
    "phone_number" "text",
    "no_status" "text",
    "vc_number" "text",
    "opty_id" "text",
    "finance_remark" "text",
    "wa_1" "text",
    "wa_2" "text",
    "next_message_date" "text",
    "wa_v1" "text",
    "wa_v2" "text",
    "remarks" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lead_id" "text"
);


ALTER TABLE "public"."matchtalk_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'user'::"text",
    "ca_names" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "full_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sent_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "lead_id" "text",
    "tab" "text",
    "day_step" integer DEFAULT 1,
    "ca_name" "text",
    "sent_by" "text",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'sent'::"text"
);


ALTER TABLE "public"."sent_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity" "text",
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "rows_processed" integer,
    "rows_inserted" integer,
    "rows_updated" integer,
    "rows_skipped" integer,
    "status" "text",
    "error_message" "text"
);


ALTER TABLE "public"."sync_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "tab" "text",
    "name" "text",
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "day_step" integer DEFAULT 1 NOT NULL,
    "ppl" "text",
    "attachments" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vana_leads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "booking_id" "text",
    "chassis_no" "text",
    "ppl" "text",
    "pl" "text",
    "colour" "text",
    "ca_name" "text",
    "opty_id" "text",
    "customer_name" "text",
    "vc_number" "text",
    "yf_open_date" "text",
    "phone_number" "text",
    "branch" "text",
    "tl_name" "text",
    "allocation_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lead_id" "text"
);


ALTER TABLE "public"."vana_leads" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_generated_leads"
    ADD CONSTRAINT "ai_generated_leads_phone_number_key" UNIQUE ("phone_number");



ALTER TABLE ONLY "public"."ai_generated_leads"
    ADD CONSTRAINT "ai_generated_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."greenform_leads"
    ADD CONSTRAINT "greenform_leads_opportunity_name_key" UNIQUE ("opportunity_name");



ALTER TABLE ONLY "public"."greenform_leads"
    ADD CONSTRAINT "greenform_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchtalk_leads"
    ADD CONSTRAINT "matchtalk_leads_phone_number_key" UNIQUE ("phone_number");



ALTER TABLE ONLY "public"."matchtalk_leads"
    ADD CONSTRAINT "matchtalk_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matchtalk_leads"
    ADD CONSTRAINT "matchtalk_leads_vc_number_unique" UNIQUE ("vc_number");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sent_messages"
    ADD CONSTRAINT "sent_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sync_logs"
    ADD CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vana_leads"
    ADD CONSTRAINT "vana_leads_opty_id_key" UNIQUE ("opty_id");



ALTER TABLE ONLY "public"."vana_leads"
    ADD CONSTRAINT "vana_leads_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "greenform_leads_lead_id_unique" ON "public"."greenform_leads" USING "btree" ("lead_id");



CREATE INDEX "idx_ai_assigned" ON "public"."ai_generated_leads" USING "btree" ("assigned_to");



CREATE INDEX "idx_ai_phone" ON "public"."ai_generated_leads" USING "btree" ("phone_number");



CREATE INDEX "idx_greenform_opp" ON "public"."greenform_leads" USING "btree" ("opportunity_name");



CREATE INDEX "idx_greenform_phone" ON "public"."greenform_leads" USING "btree" ("phone_number");



CREATE INDEX "idx_matchtalk_opty" ON "public"."matchtalk_leads" USING "btree" ("opty_id");



CREATE INDEX "idx_matchtalk_phone" ON "public"."matchtalk_leads" USING "btree" ("phone_number");



CREATE INDEX "idx_matchtalk_vc" ON "public"."matchtalk_leads" USING "btree" ("vc_number");



CREATE INDEX "idx_vana_opty" ON "public"."vana_leads" USING "btree" ("opty_id");



CREATE INDEX "idx_vana_phone" ON "public"."vana_leads" USING "btree" ("phone_number");



CREATE INDEX "idx_vana_vc" ON "public"."vana_leads" USING "btree" ("vc_number");



CREATE UNIQUE INDEX "matchtalk_leads_lead_id_unique" ON "public"."matchtalk_leads" USING "btree" ("lead_id");



CREATE UNIQUE INDEX "vana_leads_lead_id_unique" ON "public"."vana_leads" USING "btree" ("lead_id");



CREATE OR REPLACE TRIGGER "update_ai_generated_leads_updated_at" BEFORE INSERT OR UPDATE ON "public"."ai_generated_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_created_updated_dates"();



CREATE OR REPLACE TRIGGER "update_greenform_leads_updated_at" BEFORE INSERT OR UPDATE ON "public"."greenform_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_created_updated_dates"();



CREATE OR REPLACE TRIGGER "update_matchtalk_leads_updated_at" BEFORE INSERT OR UPDATE ON "public"."matchtalk_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_created_updated_dates"();



CREATE OR REPLACE TRIGGER "update_sent_messages_updated_at" BEFORE UPDATE ON "public"."sent_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_templates_updated_at" BEFORE INSERT OR UPDATE ON "public"."templates" FOR EACH ROW EXECUTE FUNCTION "public"."sync_created_updated_dates"();



CREATE OR REPLACE TRIGGER "update_vana_leads_updated_at" BEFORE INSERT OR UPDATE ON "public"."vana_leads" FOR EACH ROW EXECUTE FUNCTION "public"."sync_created_updated_dates"();



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can read all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can update profiles" ON "public"."profiles" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins full access ai_generated_leads" ON "public"."ai_generated_leads" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins full access greenform_leads" ON "public"."greenform_leads" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins full access matchtalk_leads" ON "public"."matchtalk_leads" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins full access sent_messages" ON "public"."sent_messages" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins full access templates" ON "public"."templates" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins full access vana_leads" ON "public"."vana_leads" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Sales can create sent_messages" ON "public"."sent_messages" FOR INSERT TO "authenticated" WITH CHECK (("sent_by" = "public"."get_user_email"()));



CREATE POLICY "Sales can read assigned greenform_leads" ON "public"."greenform_leads" FOR SELECT TO "authenticated" USING (("employee_full_name" = ANY ("public"."get_user_ca_names"())));



CREATE POLICY "Sales can read assigned matchtalk_leads" ON "public"."matchtalk_leads" FOR SELECT TO "authenticated" USING (("ca_name" = ANY ("public"."get_user_ca_names"())));



CREATE POLICY "Sales can read assigned vana_leads" ON "public"."vana_leads" FOR SELECT TO "authenticated" USING (("ca_name" = ANY ("public"."get_user_ca_names"())));



CREATE POLICY "Sales can read sent_messages" ON "public"."sent_messages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Sales can read templates" ON "public"."templates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Sales can read their assigned AI leads" ON "public"."ai_generated_leads" FOR SELECT TO "authenticated" USING (("assigned_to" = "public"."get_user_email"()));



CREATE POLICY "Sales can read unassigned AI leads" ON "public"."ai_generated_leads" FOR SELECT TO "authenticated" USING (("is_assigned" = false));



CREATE POLICY "Users can read their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."ai_generated_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."greenform_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matchtalk_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sent_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vana_leads" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."get_user_ca_names"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_ca_names"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_ca_names"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_created_updated_dates"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_created_updated_dates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_created_updated_dates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."ai_generated_leads" TO "anon";
GRANT ALL ON TABLE "public"."ai_generated_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_generated_leads" TO "service_role";



GRANT ALL ON TABLE "public"."greenform_leads" TO "anon";
GRANT ALL ON TABLE "public"."greenform_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."greenform_leads" TO "service_role";



GRANT ALL ON TABLE "public"."matchtalk_leads" TO "anon";
GRANT ALL ON TABLE "public"."matchtalk_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."matchtalk_leads" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sent_messages" TO "anon";
GRANT ALL ON TABLE "public"."sent_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."sent_messages" TO "service_role";



GRANT ALL ON TABLE "public"."sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_logs" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."vana_leads" TO "anon";
GRANT ALL ON TABLE "public"."vana_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."vana_leads" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































