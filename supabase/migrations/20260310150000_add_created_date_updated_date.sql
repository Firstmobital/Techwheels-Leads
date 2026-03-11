-- Adds created_date/updated_date columns expected by the app
-- while keeping created_at/updated_at as the canonical timestamps.

-- 1) Add columns (if missing)
ALTER TABLE public.vana_leads ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
ALTER TABLE public.vana_leads ADD COLUMN IF NOT EXISTS updated_date TIMESTAMPTZ;

ALTER TABLE public.matchtalk_leads ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
ALTER TABLE public.matchtalk_leads ADD COLUMN IF NOT EXISTS updated_date TIMESTAMPTZ;

ALTER TABLE public.greenform_leads ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
ALTER TABLE public.greenform_leads ADD COLUMN IF NOT EXISTS updated_date TIMESTAMPTZ;

ALTER TABLE public.ai_generated_leads ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
ALTER TABLE public.ai_generated_leads ADD COLUMN IF NOT EXISTS updated_date TIMESTAMPTZ;

ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS updated_date TIMESTAMPTZ;

-- 2) Ensure created_at/updated_at defaults exist and are non-null (backfill first)
UPDATE public.vana_leads SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.vana_leads SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE public.vana_leads ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.vana_leads ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.vana_leads ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.vana_leads ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.matchtalk_leads SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.matchtalk_leads SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE public.matchtalk_leads ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.matchtalk_leads ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.matchtalk_leads ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.matchtalk_leads ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.greenform_leads SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.greenform_leads SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE public.greenform_leads ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.greenform_leads ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.greenform_leads ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.greenform_leads ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.ai_generated_leads SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.ai_generated_leads SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE public.ai_generated_leads ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.ai_generated_leads ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.ai_generated_leads ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.ai_generated_leads ALTER COLUMN updated_at SET NOT NULL;

UPDATE public.templates SET created_at = NOW() WHERE created_at IS NULL;
UPDATE public.templates SET updated_at = NOW() WHERE updated_at IS NULL;
ALTER TABLE public.templates ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.templates ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.templates ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.templates ALTER COLUMN updated_at SET NOT NULL;

-- 3) Backfill created_date/updated_date from existing *_at columns
UPDATE public.vana_leads
SET created_date = COALESCE(created_date, created_at),
    updated_date = COALESCE(updated_date, updated_at);

UPDATE public.matchtalk_leads
SET created_date = COALESCE(created_date, created_at),
    updated_date = COALESCE(updated_date, updated_at);

UPDATE public.greenform_leads
SET created_date = COALESCE(created_date, created_at),
    updated_date = COALESCE(updated_date, updated_at);

UPDATE public.ai_generated_leads
SET created_date = COALESCE(created_date, created_at),
    updated_date = COALESCE(updated_date, updated_at);

UPDATE public.templates
SET created_date = COALESCE(created_date, created_at),
    updated_date = COALESCE(updated_date, updated_at);

-- 4) Defaults and NOT NULL for *_date columns
ALTER TABLE public.vana_leads ALTER COLUMN created_date SET DEFAULT NOW();
ALTER TABLE public.vana_leads ALTER COLUMN updated_date SET DEFAULT NOW();
UPDATE public.vana_leads SET created_date = created_at WHERE created_date IS NULL;
UPDATE public.vana_leads SET updated_date = updated_at WHERE updated_date IS NULL;
ALTER TABLE public.vana_leads ALTER COLUMN created_date SET NOT NULL;
ALTER TABLE public.vana_leads ALTER COLUMN updated_date SET NOT NULL;

ALTER TABLE public.matchtalk_leads ALTER COLUMN created_date SET DEFAULT NOW();
ALTER TABLE public.matchtalk_leads ALTER COLUMN updated_date SET DEFAULT NOW();
UPDATE public.matchtalk_leads SET created_date = created_at WHERE created_date IS NULL;
UPDATE public.matchtalk_leads SET updated_date = updated_at WHERE updated_date IS NULL;
ALTER TABLE public.matchtalk_leads ALTER COLUMN created_date SET NOT NULL;
ALTER TABLE public.matchtalk_leads ALTER COLUMN updated_date SET NOT NULL;

ALTER TABLE public.greenform_leads ALTER COLUMN created_date SET DEFAULT NOW();
ALTER TABLE public.greenform_leads ALTER COLUMN updated_date SET DEFAULT NOW();
UPDATE public.greenform_leads SET created_date = created_at WHERE created_date IS NULL;
UPDATE public.greenform_leads SET updated_date = updated_at WHERE updated_date IS NULL;
ALTER TABLE public.greenform_leads ALTER COLUMN created_date SET NOT NULL;
ALTER TABLE public.greenform_leads ALTER COLUMN updated_date SET NOT NULL;

ALTER TABLE public.ai_generated_leads ALTER COLUMN created_date SET DEFAULT NOW();
ALTER TABLE public.ai_generated_leads ALTER COLUMN updated_date SET DEFAULT NOW();
UPDATE public.ai_generated_leads SET created_date = created_at WHERE created_date IS NULL;
UPDATE public.ai_generated_leads SET updated_date = updated_at WHERE updated_date IS NULL;
ALTER TABLE public.ai_generated_leads ALTER COLUMN created_date SET NOT NULL;
ALTER TABLE public.ai_generated_leads ALTER COLUMN updated_date SET NOT NULL;

ALTER TABLE public.templates ALTER COLUMN created_date SET DEFAULT NOW();
ALTER TABLE public.templates ALTER COLUMN updated_date SET DEFAULT NOW();
UPDATE public.templates SET created_date = created_at WHERE created_date IS NULL;
UPDATE public.templates SET updated_date = updated_at WHERE updated_date IS NULL;
ALTER TABLE public.templates ALTER COLUMN created_date SET NOT NULL;
ALTER TABLE public.templates ALTER COLUMN updated_date SET NOT NULL;

-- 5) Trigger to keep *_at and *_date columns aligned
CREATE OR REPLACE FUNCTION public.sync_created_updated_dates()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- 6) Replace per-table triggers so they maintain both updated_at and updated_date
DROP TRIGGER IF EXISTS update_vana_leads_updated_at ON public.vana_leads;
CREATE TRIGGER update_vana_leads_updated_at
BEFORE INSERT OR UPDATE ON public.vana_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_created_updated_dates();

DROP TRIGGER IF EXISTS update_matchtalk_leads_updated_at ON public.matchtalk_leads;
CREATE TRIGGER update_matchtalk_leads_updated_at
BEFORE INSERT OR UPDATE ON public.matchtalk_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_created_updated_dates();

DROP TRIGGER IF EXISTS update_greenform_leads_updated_at ON public.greenform_leads;
CREATE TRIGGER update_greenform_leads_updated_at
BEFORE INSERT OR UPDATE ON public.greenform_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_created_updated_dates();

DROP TRIGGER IF EXISTS update_ai_generated_leads_updated_at ON public.ai_generated_leads;
CREATE TRIGGER update_ai_generated_leads_updated_at
BEFORE INSERT OR UPDATE ON public.ai_generated_leads
FOR EACH ROW EXECUTE FUNCTION public.sync_created_updated_dates();

DROP TRIGGER IF EXISTS update_templates_updated_at ON public.templates;
CREATE TRIGGER update_templates_updated_at
BEFORE INSERT OR UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION public.sync_created_updated_dates();
