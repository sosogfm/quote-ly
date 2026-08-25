-- 1. New enum values / types
ALTER TYPE public.dev_task_state ADD VALUE IF NOT EXISTS 'needs_revision';

DO $$ BEGIN
  CREATE TYPE public.evolution_risk_level AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.evolution_test_result AS ENUM ('pending','passed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend dev_tasks (reused as evolution proposals)
ALTER TABLE public.dev_tasks
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS problem text,
  ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS solution text,
  ADD COLUMN IF NOT EXISTS impact text,
  ADD COLUMN IF NOT EXISTS risk_level public.evolution_risk_level,
  ADD COLUMN IF NOT EXISTS risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rollback_plan text,
  ADD COLUMN IF NOT EXISTS required_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_cost text,
  ADD COLUMN IF NOT EXISTS requires_migration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS migration_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_by uuid;

CREATE INDEX IF NOT EXISTS idx_dev_tasks_source_state ON public.dev_tasks (source, state, created_at DESC);

ALTER TABLE public.dev_task_files
  ADD COLUMN IF NOT EXISTS patch text,
  ADD COLUMN IF NOT EXISTS applied boolean NOT NULL DEFAULT false;

-- 3. Admin-only access to evolution rows (chat tasks stay owner-scoped)
DROP POLICY IF EXISTS "admins manage evolution tasks" ON public.dev_tasks;
CREATE POLICY "admins manage evolution tasks" ON public.dev_tasks
  FOR ALL TO authenticated
  USING (source = 'evolution' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (source = 'evolution' AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins manage evolution task files" ON public.dev_task_files;
CREATE POLICY "admins manage evolution task files" ON public.dev_task_files
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dev_tasks t WHERE t.id = task_id AND t.source = 'evolution') AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dev_tasks t WHERE t.id = task_id AND t.source = 'evolution') AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins read evolution task events" ON public.dev_task_events;
CREATE POLICY "admins read evolution task events" ON public.dev_task_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dev_tasks t WHERE t.id = task_id AND t.source = 'evolution') AND public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins insert evolution task events" ON public.dev_task_events;
CREATE POLICY "admins insert evolution task events" ON public.dev_task_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.dev_tasks t WHERE t.id = task_id AND t.source = 'evolution') AND public.has_role(auth.uid(),'admin'));

-- 4. Test runs
CREATE TABLE IF NOT EXISTS public.evolution_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.dev_tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  result public.evolution_test_result NOT NULL DEFAULT 'pending',
  output text,
  executed_by uuid,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evolution_test_runs TO authenticated;
GRANT ALL ON public.evolution_test_runs TO service_role;
ALTER TABLE public.evolution_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage evolution test runs" ON public.evolution_test_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_evolution_test_runs_updated_at BEFORE UPDATE ON public.evolution_test_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_evolution_test_runs_task ON public.evolution_test_runs (task_id, created_at);

-- 5. Evidence sources (untrusted input)
CREATE TABLE IF NOT EXISTS public.evolution_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  message text NOT NULL,
  page text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.evolution_feedback TO authenticated;
GRANT ALL ON public.evolution_feedback TO service_role;
ALTER TABLE public.evolution_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authenticated submits feedback" ON public.evolution_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read feedback" ON public.evolution_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.evolution_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  message text NOT NULL,
  route text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.evolution_error_reports TO authenticated;
GRANT ALL ON public.evolution_error_reports TO service_role;
ALTER TABLE public.evolution_error_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone authenticated reports errors" ON public.evolution_error_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read error reports" ON public.evolution_error_reports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));