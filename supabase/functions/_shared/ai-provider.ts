import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@2";

export type AiProviderName = "groq" | "lovable";

export interface AiProviderInfo {
  provider: AiProviderName;
  label: string;
  model: string;
}

// Groq free-tier Llama models.
export const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile";
export const GROQ_FAST_MODEL = "llama-3.1-8b-instant";
const LOVABLE_CHAT_MODEL = "google/gemini-3.7-flash";

export function getAiProviderInfo(): AiProviderInfo {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    return { provider: "groq", label: "Groq · Llama 3.3 (grátis)", model: GROQ_CHAT_MODEL };
  }
  return { provider: "lovable", label: "Lovable AI (créditos)", model: LOVABLE_CHAT_MODEL };
}

/**
 * Returns a language model for chat/completions.
 * Prefers the user's own free Groq key; falls back to the Lovable AI Gateway.
 * `fast` picks the smaller Llama model when running on Groq.
 */
export function getChatModel(options?: {
  fast?: boolean;
  structuredOutputs?: boolean;
  fetch?: typeof fetch;
}) {
  const groqKey = Deno.env.get("GROQ_API_KEY");

  if (groqKey) {
    const groq = createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      headers: { Authorization: `Bearer ${groqKey}` },
      supportsStructuredOutputs: options?.structuredOutputs ?? false,
    });
    const modelId = options?.fast ? GROQ_FAST_MODEL : GROQ_CHAT_MODEL;
    return { model: groq(modelId), provider: "groq" as const, modelId };
  }

  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    throw new Error("No AI provider configured (set GROQ_API_KEY).");
  }
  const lovable = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    supportsStructuredOutputs: options?.structuredOutputs ?? false,
    ...(options?.fetch ? { fetch: options.fetch } : {}),
  });
  return {
    model: lovable(LOVABLE_CHAT_MODEL),
    provider: "lovable" as const,
    modelId: LOVABLE_CHAT_MODEL,
  };
}

/** Maps upstream AI errors to clear Portuguese messages. */
export function describeAiError(err: unknown): { message: string; status: number } {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (/429|rate.?limit/i.test(raw)) {
    return {
      message: "Limite gratuito do provedor atingido. Aguarde alguns segundos e tente de novo.",
      status: 429,
    };
  }
  if (/401|403|invalid api key|unauthorized/i.test(raw)) {
    return { message: "Chave de IA inválida ou sem permissão. Verifique a configuração.", status: 401 };
  }
  if (/402|credit/i.test(raw)) {
    return { message: "Créditos de IA esgotados no provedor atual.", status: 402 };
  }
  return { message: "Erro ao falar com o modelo de IA.", status: 500 };
}
