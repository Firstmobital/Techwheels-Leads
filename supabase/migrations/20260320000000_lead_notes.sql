CREATE TABLE public.lead_notes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ai_lead_id uuid NOT NULL REFERENCES public.ai_leads(id) ON DELETE CASCADE,
    employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    note_type text NOT NULL CHECK (note_type IN ('manual', 'whatsapp_sent', 'assigned', 'status_changed', 'green_form_opened', 'marked_uninterested')),
    note_text text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_notes_ai_lead_id_idx ON public.lead_notes (ai_lead_id);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_notes_select_authenticated
ON public.lead_notes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY lead_notes_insert_authenticated
ON public.lead_notes
FOR INSERT
TO authenticated
WITH CHECK (true);
