-- Schedule automatic Google Sheets sync every 5 minutes.
--
-- This uses:
--   - pg_cron (cron.schedule / cron.unschedule)
--   - pg_net  (net.http_post)
--
-- It is idempotent: re-running this migration will replace the schedules
-- (unschedule if present, then schedule again).

-- Ensure required extensions exist.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- Sync GreenFormLead every 5 minutes
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-greenform-leads') THEN
    PERFORM cron.unschedule('sync-greenform-leads');
  END IF;

  PERFORM cron.schedule(
    'sync-greenform-leads',
    '*/5 * * * *',
    $job$
      SELECT
        net.http_post(
          url := 'https://pytedkohelktyvclpigd.supabase.co/functions/v1/syncFromSheets',
          headers := jsonb_build_object(
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object(
            'entity', 'GreenFormLead'
          )
        );
    $job$
  );
END
$$;

-- -----------------------------------------------------------------------------
-- Sync MatchTalkLead every 5 minutes
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-matchtalk-leads') THEN
    PERFORM cron.unschedule('sync-matchtalk-leads');
  END IF;

  PERFORM cron.schedule(
    'sync-matchtalk-leads',
    '*/5 * * * *',
    $job$
      SELECT
        net.http_post(
          url := 'https://pytedkohelktyvclpigd.supabase.co/functions/v1/syncFromSheets',
          headers := jsonb_build_object(
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object(
            'entity', 'MatchTalkLead'
          )
        );
    $job$
  );
END
$$;

-- -----------------------------------------------------------------------------
-- Sync VanaLead every 5 minutes
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-vana-leads') THEN
    PERFORM cron.unschedule('sync-vana-leads');
  END IF;

  PERFORM cron.schedule(
    'sync-vana-leads',
    '*/5 * * * *',
    $job$
      SELECT
        net.http_post(
          url := 'https://pytedkohelktyvclpigd.supabase.co/functions/v1/syncFromSheets',
          headers := jsonb_build_object(
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object(
            'entity', 'VanaLead'
          )
        );
    $job$
  );
END
$$;
