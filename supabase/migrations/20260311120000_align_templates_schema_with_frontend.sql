-- Align templates table shape with frontend expectations.
-- Expected columns:
-- id, name, tab, day_step, message, ppl, attachments, created_at

BEGIN;

-- 1) Rename legacy columns if needed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'label'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'name'
  ) THEN
    EXECUTE 'ALTER TABLE public.templates RENAME COLUMN label TO name';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'content'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'templates' AND column_name = 'message'
  ) THEN
    EXECUTE 'ALTER TABLE public.templates RENAME COLUMN content TO message';
  END IF;
END $$;

-- 2) Add missing columns.
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS day_step INTEGER,
  ADD COLUMN IF NOT EXISTS ppl TEXT,
  ADD COLUMN IF NOT EXISTS attachments TEXT[];

-- 3) Backfill defaults for existing rows (preserve existing values).
UPDATE public.templates
SET
  day_step = COALESCE(day_step, 1),
  attachments = COALESCE(attachments, '{}'::TEXT[])
WHERE day_step IS NULL OR attachments IS NULL;

-- 4) Set defaults and constraints for new writes.
ALTER TABLE public.templates
  ALTER COLUMN day_step SET DEFAULT 1,
  ALTER COLUMN attachments SET DEFAULT '{}'::TEXT[];

ALTER TABLE public.templates
  ALTER COLUMN day_step SET NOT NULL;

COMMIT;
