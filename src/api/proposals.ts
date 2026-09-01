import { supabase } from '@/integrations/supabase/client';

export interface Proposal {
  id: string;
  title: string;
  description: string;
  // outros campos relevantes
}

/**
 * Busca propostas com paginação.
 * @param limit Número máximo de registros por página.
 * @param offset Quantos registros devem ser pulados.
 * @returns Lista de propostas e flag indicando se há mais registros.
 */
export async function getProposals(limit: number, offset: number) {
  const { data, error, count } = await supabase
    .from('proposals')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw error;
  }

  const hasMore = (count ?? 0) > offset + limit;
  return { proposals: data ?? [], hasMore };
}
