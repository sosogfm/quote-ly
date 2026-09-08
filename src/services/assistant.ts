/**
 * Wrapper para chamadas ao assistente de IA.
 * Primeiro tenta o modelo gratuito (ex.: openai/gpt-3.5-turbo).
 * Caso a requisição retorne erro de quota ou serviço indisponível,
 * faz nova chamada ao modelo pago (ex.: minimax/minimax-m3).
 */

import { supabase } from "../integrations/supabase/client";
import type { ChatMessage } from "../integrations/supabase/types";

/**
 * Configurações de modelo.
 * Mantidas em um único lugar para facilitar ajustes futuros.
 */
const FREE_MODEL = "gpt-3.5-turbo";
const PAID_MODEL = "minimax/minimax-m3";

/**
 * Função genérica para chamar o endpoint de IA.
 * A implementação real depende da forma como a aplicação já faz a chamada
 * (ex.: via Supabase Edge Function, fetch direto, etc.).
 * Aqui usamos um placeholder `fetchAssistant` que deve ser substituído
 * pela lógica existente.
 */
async function fetchAssistant(model: string, messages: ChatMessage[]): Promise<string> {
  // TODO: substituir pela chamada real já existente no código base.
  const response = await fetch(`/api/assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!response.ok) {
    const err = new Error(`Erro ao chamar modelo ${model}`);
    // Propagamos o status para tratamento posterior.
    // @ts-ignore - adicionamos a propriedade status ao erro.
    err.status = response.status;
    throw err;
  }
  const data = await response.json();
  return data.reply as string;
}

/**
 * Exposição pública: `callAssistant(messages)`
 */
export async function callAssistant(messages: ChatMessage[]): Promise<string> {
  try {
    // Tenta primeiro o modelo gratuito.
    return await fetchAssistant(FREE_MODEL, messages);
  } catch (error: any) {
    // Se o erro for de quota excedida (429) ou indisponibilidade (5xx), tenta o modelo pago.
    const status = error?.status ?? 0;
    if (status === 429 || (status >= 500 && status < 600)) {
      console.warn("Modelo gratuito indisponível, usando modelo pago.", error);
      return await fetchAssistant(PAID_MODEL, messages);
    }
    // Qualquer outro erro é re‑lançado para que a camada superior trate adequadamente.
    throw error;
  }
}
