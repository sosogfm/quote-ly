CREATE TABLE IF NOT EXISTS public.proposal_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    file_path text NOT NULL,
    public_url text NOT NULL,
    uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- Ativar Row Level Security (RLS) – recomendação manual para ajustes de políticas
ALTER TABLE public.proposal_files ENABLE ROW LEVEL SECURITY;

-- Exemplo de política (apenas administradores e criadores da proposta podem ler)
-- RECOMMENDATION: Ajustar conforme necessidade de segurança.
/*
CREATE POLICY "allow_read_own_proposal" ON public.proposal_files
  USING (auth.uid() = (SELECT created_by FROM proposals WHERE id = proposal_id));
*/
