ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name TEXT;

UPDATE public.profiles
SET full_name = email
WHERE full_name IS NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, ca_names)
  VALUES (new.id, new.email, new.email, 'user', '{}');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
