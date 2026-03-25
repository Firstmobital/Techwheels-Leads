CREATE TABLE public.greenform_closure_requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_type text NOT NULL CHECK (source_type IN ('walkin', 'ivr', 'ai')),
    source_record_id text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('not_interested', 'bought_elsewhere', 'price_issue', 'unreachable', 'duplicate', 'other')),
    remarks text NULL,
    requested_by_employee_id bigint NULL REFERENCES public.employees(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.greenform_closure_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY greenform_closure_requests_select_authenticated
ON public.greenform_closure_requests
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY greenform_closure_requests_insert_authenticated
ON public.greenform_closure_requests
FOR INSERT
TO authenticated
WITH CHECK (true);
