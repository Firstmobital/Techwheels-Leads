-- Create sync_logs table for monitoring Google Sheets → Supabase sync runs.
-- Uses gen_random_uuid() (pgcrypto extension).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text,
  started_at timestamptz,
  finished_at timestamptz,
  rows_processed integer,
  rows_inserted integer,
  rows_updated integer,
  rows_skipped integer,
  status text,
  error_message text
);
