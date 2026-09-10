UPDATE public.chat_messages SET sdk_message_id = id::text WHERE sdk_message_id IS NULL;
ALTER TABLE public.chat_messages ALTER COLUMN sdk_message_id SET NOT NULL;
DROP INDEX IF EXISTS public.chat_messages_thread_sdk_unique;
CREATE UNIQUE INDEX chat_messages_thread_sdk_unique ON public.chat_messages (thread_id, sdk_message_id);