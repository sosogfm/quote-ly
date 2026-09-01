import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@2";
import type { LanguageModel } from "npm:ai@7";

export type AiProviderName = "groq" | "openrouter" | "lovable" | "custom";

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
export const OPENROUTER_CHAT_MODEL = "minimax/minimax-m3:free";
export const OPENROUTER_FAST_MODEL = "minimax/minimax-m3:free";
const LOVABLE_CHAT_MODEL = "google/gemini-3.7-flash";

export interface AiSettings {
  provider_order: string[];
  groq_chat_model: string;
  groq_fast_model: string;
  openrouter_chat_model: string;
  openrouter_fast_model: string;
  lovable_chat_model: string;
  custom_enabled: boolean;
  custom_label: string;
  custom_base_url: string | null;
  custom_chat_model: string | null;
  custom_fast_model: string | null;
  custom_supports_structured: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider_order: ["custom", "groq", "openrouter", "lovable"],
  groq_chat_model: GROQ_CHAT_MODEL,
  groq_fast_model: GROQ_FAST_MODEL,
  openrouter_chat_model: OPENROUTER_CHAT_MODEL,
  openrouter_fast_model: OPENROUTER_FAST_MODEL,
  lovable_chat_model: LOVABLE_CHAT_MODEL,
  custom_enabled: false,
  custom_label: "Local",
  custom_base_url: null,
  custom_chat_model: null,
  custom_fast_model: null,
  custom_supports_structured: false,
};

let settingsCache: { at: number; value: AiSettings } | null = null;

/** Loads admin-configured AI settings (cached 20s). Falls back to defaults. */
export async function loadAiSettings(): Promise<AiSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 20_000) return settingsCache.value;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return DEFAULT_AI_SETTINGS;
    const res = await fetch(`${url}/rest/v1/ai_settings?id=eq.global&select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return DEFAULT_AI_SETTINGS;
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return DEFAULT_AI_SETTINGS;
    const value: AiSettings = { ...DEFAULT_AI_SETTINGS, ...row };
    settingsCache = { at: Date.now(), value };
    return value;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

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

/** Providers whose configured models cannot read images (text-only). */
const NON_VISION_PROVIDERS: AiProviderName[] = ["groq"];

async function providerConfigs(
  fast: boolean,
  exclude: AiProviderName[] = [],
): Promise<ProviderConfig[]> {
  const settings = await loadAiSettings();
  const byName = new Map<AiProviderName, ProviderConfig>();

  if (settings.custom_enabled && settings.custom_base_url) {
    const customKey = Deno.env.get("CUSTOM_AI_API_KEY");
    byName.set("custom", {
      name: "custom",
      baseURL: settings.custom_base_url.replace(/\/+$/, ""),
      modelId: (fast ? settings.custom_fast_model : settings.custom_chat_model) ||
        settings.custom_chat_model || settings.custom_fast_model || "local-model",
      headers: customKey ? { Authorization: `Bearer ${customKey}` } : {},
      supportsStructuredOutputs: settings.custom_supports_structured,
    });
  }

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    byName.set("groq", {
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      modelId: fast ? settings.groq_fast_model : settings.groq_chat_model,
      headers: { Authorization: `Bearer ${groqKey}` },
      supportsStructuredOutputs: true,
    });
  }

  const orKey = Deno.env.get("OPENROUTER_API_KEY");
  if (orKey) {
    byName.set("openrouter", {
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      modelId: fast ? settings.openrouter_fast_model : settings.openrouter_chat_model,
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
    byName.set("lovable", {
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      modelId: settings.lovable_chat_model,
      headers: {
        "Lovable-API-Key": lovableApiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      supportsStructuredOutputs: true,
    });
  }

  const order = settings.provider_order?.length
    ? settings.provider_order
    : DEFAULT_AI_SETTINGS.provider_order;
  const configs: ProviderConfig[] = [];
  for (const name of order) {
    const c = byName.get(name as AiProviderName);
    if (c) { configs.push(c); byName.delete(name as AiProviderName); }
  }
  // Anything configured but not listed in the order goes last.
  for (const c of byName.values()) configs.push(c);
  return configs.filter((c) => !exclude.includes(c.name));
}

/**
 * Returns the active provider chain in priority order (Groq → OpenRouter → Lovable).
 * Each entry has a model built with the right structuredOutputs setting for that provider.
 */
export async function getProviderChain(options?: {
  fast?: boolean;
  structuredOutputs?: boolean;
  fetch?: typeof fetch;
  /** Set when the request carries images: text-only providers are skipped. */
  requireVision?: boolean;
}): Promise<ChainEntry[]> {
  const fast = options?.fast ?? false;
  const wantStructured = options?.structuredOutputs ?? false;
  const configs = await providerConfigs(
    fast,
    options?.requireVision ? NON_VISION_PROVIDERS : [],
  );

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
export async function getChatModel(options?: {
  fast?: boolean;
  structuredOutputs?: boolean;
  fetch?: typeof fetch;
  requireVision?: boolean;
}) {
  const chain = await getProviderChain(options);
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
  const chain = await getProviderChain(options);
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
export async function createChainFallbackFetch(
  options?: { fast?: boolean; fetch?: typeof fetch; requireVision?: boolean },
): Promise<typeof fetch> {
  const innerFetch = options?.fetch ?? fetch;
  const configs = await providerConfigs(
    options?.fast ?? false,
    options?.requireVision ? NON_VISION_PROVIDERS : [],
  );
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

export async function getAiProviderInfo(): Promise<AiProviderInfo> {
  const configs = await providerConfigs(false);
  if (configs.length === 0) {
    return { provider: "none", label: "IA não configurada", model: "", chain: [] };
  }
  const primary = configs[0];
  const chain = configs.map((c) => c.name);

  const settings = await loadAiSettings();
  const display: Record<AiProviderName, string> = {
    groq: "Groq",
    openrouter: "OpenRouter",
    lovable: "Lovable",
    custom: settings.custom_label || "Local",
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
