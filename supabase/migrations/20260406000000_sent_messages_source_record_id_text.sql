ALTER TABLE public.sent_messages
ALTER COLUMN source_record_id TYPE text USING source_record_id::text;

ALTER TABLE public.sent_messages
DROP CONSTRAINT IF EXISTS sent_messages_lead_source_check;

ALTER TABLE public.sent_messages
ADD CONSTRAINT sent_messages_lead_source_check CHECK (
  lead_source = ANY (ARRAY['walkin','ivr','ai','vna','matchtalk','greenforms'])
);