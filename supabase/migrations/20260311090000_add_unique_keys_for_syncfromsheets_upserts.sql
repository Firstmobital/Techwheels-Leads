-- Ensure database-side deduplication works for syncFromSheets bulk upserts.
--
-- The Edge Function uses: upsert(rows, { onConflict: <uniqueKey> })
-- Postgres requires a UNIQUE constraint or UNIQUE index on that column.
--
-- This migration adds UNIQUE constraints if they do not already exist.
-- It is intentionally fail-fast: if duplicates exist for a column (non-null / non-blank),
-- it raises an exception instead of silently dropping/merging data.

-- -----------------------------------------------------------------------------
-- matchtalk_leads.vc_number (required for MatchTalkLead onConflict)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public'
      AND t.relname = 'matchtalk_leads'
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'vc_number'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.matchtalk_leads
      WHERE vc_number IS NOT NULL
        AND btrim(vc_number) <> ''
      GROUP BY vc_number
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot add UNIQUE constraint: duplicates exist in public.matchtalk_leads.vc_number';
    END IF;

    ALTER TABLE public.matchtalk_leads
      ADD CONSTRAINT matchtalk_leads_vc_number_unique UNIQUE (vc_number);
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- greenform_leads.opportunity_name (required for GreenFormLead onConflict)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public'
      AND t.relname = 'greenform_leads'
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'opportunity_name'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.greenform_leads
      WHERE opportunity_name IS NOT NULL
        AND btrim(opportunity_name) <> ''
      GROUP BY opportunity_name
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot add UNIQUE constraint: duplicates exist in public.greenform_leads.opportunity_name';
    END IF;

    ALTER TABLE public.greenform_leads
      ADD CONSTRAINT greenform_leads_opportunity_name_unique UNIQUE (opportunity_name);
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- vana_leads.opty_id (required for VanaLead onConflict)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
    WHERE n.nspname = 'public'
      AND t.relname = 'vana_leads'
      AND i.indisunique
      AND i.indnatts = 1
      AND a.attname = 'opty_id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.vana_leads
      WHERE opty_id IS NOT NULL
        AND btrim(opty_id) <> ''
      GROUP BY opty_id
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Cannot add UNIQUE constraint: duplicates exist in public.vana_leads.opty_id';
    END IF;

    ALTER TABLE public.vana_leads
      ADD CONSTRAINT vana_leads_opty_id_unique UNIQUE (opty_id);
  END IF;
END
$$;
