CREATE TABLE public.evolution_repo_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  base_branch text NOT NULL DEFAULT 'main',
  auto_apply_enabled boolean NOT NULL DEFAULT true,
  max_auto_risk text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_repo_settings TO authenticated;
GRANT ALL ON public.evolution_repo_settings TO service_role;

ALTER TABLE public.evolution_repo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage repo settings"
ON public.evolution_repo_settings
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_evolution_repo_settings_updated_at
BEFORE UPDATE ON public.evolution_repo_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.evolution_repo_settings (repo_owner, repo_name, base_branch)
VALUES ('sosogfm', 'quote-ly', 'main');

ALTER TABLE public.dev_tasks
  ADD COLUMN IF NOT EXISTS github_pr_url text,
  ADD COLUMN IF NOT EXISTS github_pr_number integer,
  ADD COLUMN IF NOT EXISTS github_branch text,
  ADD COLUMN IF NOT EXISTS github_pr_opened_at timestamptz;