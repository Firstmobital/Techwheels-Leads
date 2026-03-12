ALTER TABLE public.sent_messages
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

UPDATE public.sent_messages
SET status = 'sent'
WHERE status IS NULL;
