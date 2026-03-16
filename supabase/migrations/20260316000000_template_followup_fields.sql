-- Add follow-up sequencing fields to templates.
-- Safe defaults keep legacy rows and older clients compatible.
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS delay_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS step_number integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'templates_delay_days_nonnegative'
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_delay_days_nonnegative CHECK (delay_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'templates_step_number_positive'
  ) THEN
    ALTER TABLE public.templates
      ADD CONSTRAINT templates_step_number_positive CHECK (step_number >= 1);
  END IF;
END
$$;
