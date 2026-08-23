-- ============ MEMORY ============
CREATE TYPE public.memory_kind AS ENUM ('preference', 'style', 'fact', 'correction', 'skill');

CREATE TABLE public.user_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.memory_kind NOT NULL DEFAULT 'fact',
  content text NOT NULL,
  source_thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  importance integer NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_memories TO authenticated;
GRANT ALL ON public.user_memories TO service_role;
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memories" ON public.user_memories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_user_memories_user ON public.user_memories(user_id, active, importance DESC, updated_at DESC);
CREATE TRIGGER update_user_memories_updated_at BEFORE UPDATE ON public.user_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_profile_summary (
  user_id uuid PRIMARY KEY,
  summary text NOT NULL DEFAULT '',
  writing_style text,
  message_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile_summary TO authenticated;
GRANT ALL ON public.user_profile_summary TO service_role;
ALTER TABLE public.user_profile_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own summary" ON public.user_profile_summary FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_user_profile_summary_updated_at BEFORE UPDATE ON public.user_profile_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ DEV MODE ============
CREATE TYPE public.dev_task_state AS ENUM (
  'analyzing','awaiting_approval','creating_branch','editing_code','running_tests',
  'fixing_errors','generating_preview','awaiting_review','approved','rejected',
  'opening_pr','deploying','deployed','deploy_failed','rolled_back','cancelled'
);
CREATE TYPE public.dev_change_mode AS ENUM ('conservative','balanced','refactor');

CREATE TABLE public.dev_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid REFERENCES public.threads(id) ON DELETE SET NULL,
  title text NOT NULL,
  request text NOT NULL,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  state public.dev_task_state NOT NULL DEFAULT 'analyzing',
  change_mode public.dev_change_mode NOT NULL DEFAULT 'conservative',
  repository text,
  base_branch text,
  work_branch text,
  environment text NOT NULL DEFAULT 'preview',
  simulated boolean NOT NULL DEFAULT true,
  test_results jsonb,
  preview jsonb,
  deployment jsonb,
  plan_approved_at timestamptz,
  plan_approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_tasks TO authenticated;
GRANT ALL ON public.dev_tasks TO service_role;
ALTER TABLE public.dev_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own dev tasks" ON public.dev_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_dev_tasks_user ON public.dev_tasks(user_id, updated_at DESC);
CREATE TRIGGER update_dev_tasks_updated_at BEFORE UPDATE ON public.dev_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.dev_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.dev_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  from_state public.dev_task_state,
  to_state public.dev_task_state,
  detail jsonb,
  simulated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.dev_task_events TO authenticated;
GRANT ALL ON public.dev_task_events TO service_role;
ALTER TABLE public.dev_task_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own task events read" ON public.dev_task_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "own task events insert" ON public.dev_task_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_dev_task_events_task ON public.dev_task_events(task_id, created_at);

CREATE TABLE public.dev_task_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.dev_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  path text NOT NULL,
  change_type text NOT NULL DEFAULT 'modified',
  reason text,
  language text,
  old_content text,
  new_content text,
  reverted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dev_task_files TO authenticated;
GRANT ALL ON public.dev_task_files TO service_role;
ALTER TABLE public.dev_task_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own task files" ON public.dev_task_files FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_dev_task_files_task ON public.dev_task_files(task_id, path);
CREATE TRIGGER update_dev_task_files_updated_at BEFORE UPDATE ON public.dev_task_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();