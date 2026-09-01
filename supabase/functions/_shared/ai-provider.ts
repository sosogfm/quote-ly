import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@2";
import type { LanguageModel } from "npm:ai@7";

export type AiProviderName = "groq" | "openrouter" | "lovable";

export interface AiProviderInfo {
  provider: string;
  label: string;
  model: string;
  chain: string[];
}

// Groq-hosted open models. Llama 3.1/3.3 are no longer served on this Groq account
// (only Llama Prompt Guard remains), so we use the open GPT-OSS models Groq offers.
export const GROQ_CHAT_MODEL = "openai/gpt-oss-120b";
export const GROQ_FAST_MODEL = "openai/gpt-oss-20b";
// OpenRouter free variants (globally accessible, no card, work in Brazil).
export const OPENROUTER_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
export const OPENROUTER_FAST_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
const LOVABLE_CHAT_MODEL = "google/gemini-3.7-flash";

export interface ChainEntry {
  name: AiProviderName;
  model: LanguageModel;
  modelId: string;
  structuredOutputs: boolean;
}

interface ProviderConfig {
  name: AiProviderName;
  baseURL: string;
  modelId: string;
  headers: Record<string, string>;
  supportsStructuredOutputs: boolean;
}

function providerConfigs(fast: boolean): ProviderConfig[] {
  const configs: ProviderConfig[] = [];

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    configs.push({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      modelId: fast ? GROQ_FAST_MODEL : GROQ_CHAT_MODEL,
      headers: { Authorization: `Bearer ${groqKey}` },
      supportsStructuredOutputs: true,
    });
  }

  const orKey = Deno.env.get("OPENROUTER_API_KEY");
  if (orKey) {
    configs.push({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      modelId: fast ? OPENROUTER_FAST_MODEL : OPENROUTER_CHAT_MODEL,
      headers: {
        Authorization: `Bearer ${orKey}`,
        "HTTP-Referer": "https://quote-ly.lovable.app",
        "X-Title": "QuoteKit Evolution",
      },
      supportsStructuredOutputs: false, // free models: json_object mode only
    });
  }

  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableApiKey) {
    configs.push({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      modelId: LOVABLE_CHAT_MODEL,
      headers: {
        "Lovable-API-Key": lovableApiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      supportsStructuredOutputs: true,
    });
  }

  return configs;
}

/**
 * Returns the active provider chain in priority order (Groq → OpenRouter → Lovable).
 * Each entry has a model built with the right structuredOutputs setting for that provider.
 */
export function getProviderChain(options?: {
  fast?: boolean;
  structuredOutputs?: boolean;
  fetch?: typeof fetch;
}): ChainEntry[] {
  const fast = options?.fast ?? false;
  const wantStructured = options?.structuredOutputs ?? false;
  const configs = providerConfigs(fast);

  const chain: ChainEntry[] = [];
  for (const c of configs) {
    const supportsStructured = c.supportsStructuredOutputs && wantStructured;
    const provider = createOpenAICompatible({
      name: c.name,
      baseURL: c.baseURL,
      headers: c.headers,
      supportsStructuredOutputs: supportsStructured,
      ...(options?.fetch ? { fetch: options.fetch } : {}),
    });
    chain.push({
      name: c.name,
      model: provider(c.modelId),
      modelId: c.modelId,
      structuredOutputs: supportsStructured,
    });
  }

  if (chain.length === 0) {
    throw new Error("No AI provider configured (set GROQ_API_KEY, OPENROUTER_API_KEY, or LOVABLE_API_KEY).");
  }
  return chain;
}

/**
 * Returns a language model for the primary provider (first in the chain).
 * Kept for backward compatibility with simple call sites.
 */
export function getChatModel(options?: {
  fast?: boolean;
  structuredOutputs?: boolean;
  fetch?: typeof fetch;
}) {
  const chain = getProviderChain(options);
  const primary = chain[0];
  return { model: primary.model, provider: primary.name, modelId: primary.modelId };
}

/**
 * Runs an AI call across the provider chain, falling over to the next provider
 * when the current one rate-limits (429) or rejects auth (401/403) or fails
 * transiently (5xx/network). Also falls over on schema-mismatch
 * (NoObjectGeneratedError) so a provider that returns non-conforming JSON
 * gets a second chance on the next provider. Only throws if every provider fails.
 */
export async function generateWithFallback<T>(
  options: {
    fast?: boolean;
    structuredOutputs?: boolean;
    fetch?: typeof fetch;
  },
  run: (model: LanguageModel) => Promise<T>,
): Promise<T> {
  const chain = getProviderChain(options);
  let lastError: unknown;
  for (const entry of chain) {
    try {
      return await run(entry.model);
    } catch (err) {
      lastError = err;
      if (isFallbackableError(err)) continue;
      throw err;
    }
  }
  throw lastError;
}

function isFallbackableError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  // Rate limit / auth (one provider's key bad — the next has its own) / transient upstream.
  if (/429|rate.?limit|too many requests/i.test(raw)) return true;
  if (/401|403|unauthorized|invalid api key|forbidden/i.test(raw)) return true;
  if (/500|502|503|504|network|econnreset|fetch failed|socket hang up|aborted/i.test(raw)) return true;
  // Schema-mismatch / no-object: a different provider might emit conforming JSON.
  if (/NoObjectGenerated|no object generated|schema|json/i.test(raw)) return true;
  return false;
}

/**
 * Builds a single composite fetch for the primary provider that transparently
 * re-issues a failed (429/401/403) chat-completions request to the next provider
 * in the chain, swapping baseURL, auth header and model id. Used for streaming
 * chat where the AI SDK drives a single fetch call — this keeps fallback
 * transparent without touching the stream serialization.
 */
export function createChainFallbackFetch(
  options?: { fast?: boolean; fetch?: typeof fetch },
): typeof fetch {
  const innerFetch = options?.fetch ?? fetch;
  const configs = providerConfigs(options?.fast ?? false);
  // Fallback targets = everything after the primary.
  const fallbacks = configs.slice(1);

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let res = await innerFetch(input, init);
    if (res.status !== 429 && res.status !== 401 && res.status !== 403) return res;

    for (const fb of fallbacks) {
      try {
        const headers = new Headers(init?.headers ?? {});
        headers.delete("Authorization");
        headers.delete("Lovable-API-Key");
        for (const [k, v] of Object.entries(fb.headers)) headers.set(k, v);

        let body = init?.body;
        if (typeof body === "string") {
          try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === "object" && "model" in parsed) {
              parsed.model = fb.modelId;
              body = JSON.stringify(parsed);
            }
          } catch {
            // not JSON — leave body as-is
          }
        }

        res = await innerFetch(`${fb.baseURL}/chat/completions`, { ...init, headers, body });
        if (res.status !== 429 && res.status !== 401 && res.status !== 403) return res;
      } catch {
        // this fallback failed to even respond — try the next
      }
    }
    return res;
  };
}

export function getAiProviderInfo(): AiProviderInfo {
  const configs = providerConfigs(false);
  if (configs.length === 0) {
    return { provider: "none", label: "IA não configurada", model: "", chain: [] };
  }
  const primary = configs[0];
  const chain = configs.map((c) => c.name);

  const display: Record<AiProviderName, string> = {
    groq: "Groq",
    openrouter: "OpenRouter",
    lovable: "Lovable",
  };

  // Lovable is the paid last resort — only surface it in the label when it's
  // the only configured provider; otherwise show the free chain.
  const freeNames = chain.filter((n) => n !== "lovable");
  const label = freeNames.length > 0
    ? `${freeNames.map((n) => display[n]).join(" + ")} (grátis)`
    : "Lovable AI (créditos)";

  return { provider: primary.name, label, model: primary.modelId, chain };
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
