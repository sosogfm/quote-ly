DELETE FROM public.chat_messages c
USING public.chat_messages k
WHERE c.sdk_message_id IS NOT NULL
  AND k.sdk_message_id = c.sdk_message_id
  AND k.thread_id = c.thread_id
  AND (k.created_at < c.created_at OR (k.created_at = c.created_at AND k.id < c.id));

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_thread_sdk_unique
  ON public.chat_messages (thread_id, sdk_message_id)
  WHERE sdk_message_id IS NOT NULL;