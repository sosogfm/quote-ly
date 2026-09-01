CREATE TABLE public.ai_settings (
  id text PRIMARY KEY DEFAULT 'global',
  provider_order text[] NOT NULL DEFAULT ARRAY['custom','groq','openrouter','lovable'],
  groq_chat_model text NOT NULL DEFAULT 'openai/gpt-oss-120b',
  groq_fast_model text NOT NULL DEFAULT 'openai/gpt-oss-20b',
  openrouter_chat_model text NOT NULL DEFAULT 'minimax/minimax-m3:free',
  openrouter_fast_model text NOT NULL DEFAULT 'minimax/minimax-m3:free',
  lovable_chat_model text NOT NULL DEFAULT 'google/gemini-3.7-flash',
  custom_enabled boolean NOT NULL DEFAULT false,
  custom_label text NOT NULL DEFAULT 'Local',
  custom_base_url text,
  custom_chat_model text,
  custom_fast_model text,
  custom_supports_structured boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.ai_settings TO authenticated;
GRANT ALL ON public.ai_settings TO service_role;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai settings" ON public.ai_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert ai settings" ON public.ai_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update ai settings" ON public.ai_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.ai_settings (id) VALUES ('global') ON CONFLICT DO NOTHING;