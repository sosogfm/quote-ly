CREATE TABLE public.showcase_sites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  url text NOT NULL,
  image_url text,
  tags text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.showcase_sites TO authenticated;
GRANT ALL ON public.showcase_sites TO service_role;

ALTER TABLE public.showcase_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own showcase sites"
ON public.showcase_sites FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_showcase_sites_updated_at
BEFORE UPDATE ON public.showcase_sites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_showcase_sites_user_order ON public.showcase_sites(user_id, sort_order, created_at DESC);