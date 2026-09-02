ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.threads t
SET last_message_at = COALESCE(
  (SELECT MAX(m.created_at) FROM public.chat_messages m WHERE m.thread_id = t.id),
  t.created_at
);

CREATE INDEX IF NOT EXISTS idx_threads_user_last_message ON public.threads (user_id, last_message_at DESC);