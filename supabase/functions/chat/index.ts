import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
} from "npm:ai@7";
import { getChatModel, createChainFallbackFetch } from "../_shared/ai-provider.ts";
import {
  listRepoFiles,
  loadRepoRef,
  readRepoFile,
  repoAvailable,
  searchRepo,
} from "../_shared/repo.ts";
import { z } from "npm:zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveRunId: (value: string | undefined) => void = () => {};
  let runIdResolved = false;
  const runIdReady = new Promise<string | undefined>((resolve) => {
    resolveRunId = resolve;
  });

  const publishRunId = (value?: string) => {
    const next = value?.trim() || undefined;
    if (!runId && next) runId = next;
    if (!runIdResolved) {
      runIdResolved = true;
      resolveRunId(runId);
    }
  };
  if (runId) publishRunId(runId);

  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
        headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      }
      try {
        const response = await fetch(input, { ...init, headers });
        publishRunId(response.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined);
        return response;
      } catch (error) {
        publishRunId(undefined);
        throw error;
      }
    },
    getRunId: () => runId,
    waitForRunId: () => (runId ? Promise.resolve(runId) : runIdReady),
  };
}

const SYSTEM_PROMPT = `Você é o assistente pessoal de trabalho da usuária: um colaborador técnico direto, no espírito de um engenheiro sênior somado a um bom redator.

Idioma: responda sempre em português do Brasil, salvo se a mensagem estiver em outro idioma.

Tom (regras rígidas, sem exceção):
- NUNCA use emojis, emoticons ou ícones decorativos.
- NUNCA elogie a usuária nem a pergunta ("ótima pergunta", "excelente ideia", "que legal"). Sem bajulação, sem entusiasmo performático, sem exclamações.
- Sem preâmbulo e sem resumo do que você "vai fazer": entregue a resposta.
- Discorde quando for o caso e diga o motivo em uma frase. Se não souber, diga que não sabe.
- Frases curtas. Zero enchimento. Nada de "espero que ajude".

O que você faz:
1. Documentos e escrita — propostas, relatórios, briefings, planos. Markdown limpo, prosa enxuta.
2. Código — completo e executável, em blocos cercados com a linguagem indicada.
3. Raciocínio e planejamento — quebre o problema em passos, explicite premissas e riscos.

## Código deste próprio sistema
Você tem acesso de LEITURA ao repositório deste projeto, o mesmo usado pela Central de Evolução. Use as ferramentas \`list_project_files\`, \`read_project_file\` e \`search_project_code\` antes de opinar sobre o funcionamento do sistema — nunca invente nomes de arquivos, funções ou trechos. Você não pode escrever no repositório: mudanças passam por uma proposta na Central de Evolução (explique isso quando a usuária pedir alteração no sistema).

## Arquivos gerados (PDF, PNG, código, planilhas)
Quando a usuária pedir um arquivo (PDF, imagem/PNG, documento, CSV, código), chame a ferramenta \`create_file\`. Ela cria um arquivo baixável no painel "Arquivos" ao lado da conversa. Escolha o formato:
- \`pdf\` ou \`png\`: envie HTML completo e bem formatado no campo content (com <style> inline; largura de página A4 para pdf). Não use imagens externas.
- \`markdown\`, \`csv\`, \`code\`, \`svg\`, \`html\`, \`txt\`: envie o conteúdo bruto.
Depois de criar, diga em uma linha o que foi gerado. Não repita todo o conteúdo do arquivo na resposta.

## Arquivos enviados pela usuária
Imagens chegam como anexo e você as vê diretamente. Documentos (PDF, texto, planilha) chegam já extraídos como texto marcado com o nome do arquivo. Trabalhe sobre o conteúdo real; se a extração vier vazia, diga isso.

## Memória de longo prazo
Você tem acesso à memória da conta: fatos, preferências, estilo de escrita e correções. Use para adaptar cada resposta e nunca repetir uma correção já feita. Trate a memória como verdade até a usuária atualizar.

Quando a usuária declarar uma preferência durável, uma correção, um fato pessoal ou ensinar uma habilidade reutilizável, chame a ferramenta \`remember\`. Uma chamada por item, nunca para conversa passageira.`;

interface MemoryContext {
  summary: string | null;
  writingStyle: string | null;
  memories: { kind: string; content: string; importance: number }[];
  recentThreads: { title: string; updatedAt: string }[];
  recentExchanges: { role: string; text: string }[];
}

async function loadMemoryContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<MemoryContext> {
  const [summaryRes, memoriesRes, threadsRes, recentRes] = await Promise.all([
    supabase
      .from("user_profile_summary")
      .select("summary, writing_style")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_memories")
      .select("kind, content, importance")
      .eq("user_id", userId)
      .eq("active", true)
      .order("importance", { ascending: false })
      .limit(15),
    supabase
      .from("threads")
      .select("title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8),
    // Cross-thread recall: the last things the user actually said, so the
    // assistant remembers topics discussed in *other* conversations.
    supabase
      .from("chat_messages")
      .select("role, text_content, created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return {
    summary: summaryRes.data?.summary ?? null,
    writingStyle: summaryRes.data?.writing_style ?? null,
    memories: (memoriesRes.data ?? []) as {
      kind: string;
      content: string;
      importance: number;
    }[],
    recentThreads: (threadsRes.data ?? []) as {
      title: string;
      updatedAt: string;
    }[],
    recentExchanges: ((recentRes.data ?? []) as { role: string; text_content: string | null }[])
      .filter((r) => (r.text_content ?? "").trim().length > 0)
      .map((r) => ({ role: r.role, text: (r.text_content ?? "").slice(0, 300) }))
      .reverse(),
  };
}

function buildMemoryBlock(ctx: MemoryContext): string {
  const parts: string[] = [];
  if (ctx.summary) {
    parts.push(`### What you know about this user\n${ctx.summary}`);
  }
  if (ctx.writingStyle) {
    parts.push(`### Their writing style\n${ctx.writingStyle}`);
  }
  if (ctx.memories.length > 0) {
    const grouped = ctx.memories
      .map((m) => `- [${m.kind}] (importance ${m.importance}) ${m.content}`)
      .join("\n");
    parts.push(`### Saved memories\n${grouped}`);
  }
  if (ctx.recentThreads.length > 0) {
    const titles = ctx.recentThreads
      .map((t) => `- ${t.title}`)
      .join("\n");
    parts.push(`### Recent conversations (for continuity)\n${titles}`);
  }
  if (ctx.recentExchanges.length > 0) {
    const lines = ctx.recentExchanges.map((m) => `- ${m.text}`).join("\n");
    parts.push(
      `### Things the user recently said in other conversations (oldest first)\n${lines}`,
    );
  }
  return parts.length > 0
    ? `\n\n## User memory (private, scoped to this account)\n${parts.join("\n\n")}`
    : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    if (!Deno.env.get("GROQ_API_KEY") && !Deno.env.get("OPENROUTER_API_KEY") && !Deno.env.get("LOVABLE_API_KEY")) {
      return new Response(JSON.stringify({ error: "IA não configurada." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages = (body?.messages ?? []) as UIMessage[];
    const projectInstructions: string | undefined = body?.projectInstructions;
    const threadId: string | undefined = body?.threadId;

    const memoryCtx = await loadMemoryContext(supabase, userId);
    const memoryBlock = buildMemoryBlock(memoryCtx);

    const initialRunId = req.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
    const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);

    // Images require a multimodal provider; text-only providers are skipped.
    const hasImage = messages.some((m) =>
      Array.isArray(m.parts) &&
      m.parts.some(
        (p) =>
          (p as { type?: string; mediaType?: string }).type === "file" &&
          ((p as { mediaType?: string }).mediaType ?? "").startsWith("image/"),
      )
    );

    const chainFetch = await createChainFallbackFetch({
      fetch: runIdFetch.fetch as typeof fetch,
      requireVision: hasImage,
    });
    const { model, provider, modelId } = await getChatModel({
      fetch: chainFetch,
      requireVision: hasImage,
    });
    console.log("chat: using provider", provider, modelId, "(with fallback chain)");

    const projectBlock = projectInstructions
      ? `\n\nProject context and standing instructions from the user:\n${projectInstructions}`
      : "";
    const system = `${SYSTEM_PROMPT}${memoryBlock}${projectBlock}`;

    // Groq rejects `reasoning_content` parts that the AI SDK re-injects from
    // prior assistant turns. Strip reasoning parts before conversion so the
    // provider never sees them (the reasoning still renders in the UI via the
    // streamed response with sendReasoning: true).
    const strippedMessages = messages.map((m) => ({
      ...m,
      parts: Array.isArray(m.parts)
        ? m.parts.filter((p) => {
            if (p.type === "reasoning") return false;
            // Non-image attachments are extracted to text on the client;
            // forwarding their raw bytes breaks the free providers.
            if (p.type === "file") {
              return ((p as { mediaType?: string }).mediaType ?? "").startsWith("image/");
            }
            return true;
          })
        : m.parts,
    }));

    // Groq's free tier caps tokens per request, so long threads must be
    // trimmed. Keep the most recent turns within a character budget
    // (~4 chars per token) and always keep at least the last message.
    const HISTORY_CHAR_BUDGET = 24000;
    const messagesForModel: typeof strippedMessages = [];
    let used = 0;
    for (let i = strippedMessages.length - 1; i >= 0; i--) {
      const m = strippedMessages[i];
      const size = JSON.stringify(m.parts ?? "").length;
      if (messagesForModel.length > 0 && used + size > HISTORY_CHAR_BUDGET) break;
      messagesForModel.unshift(m);
      used += size;
    }
    if (messagesForModel.length < strippedMessages.length) {
      console.log(
        `chat: trimmed history ${strippedMessages.length} -> ${messagesForModel.length} messages (${used} chars)`,
      );
    }


    const result = streamText({
      model,

      system,
      messages: await convertToModelMessages(messagesForModel),
      abortSignal: req.signal,
      stopWhen: stepCountIs(8),
      tools: {
        list_project_files: tool({
          description:
            "Lista os caminhos dos arquivos do código-fonte deste próprio sistema (repositório do projeto). Use antes de ler arquivos para descobrir os caminhos reais.",
          inputSchema: z.object({
            filter: z
              .string()
              .max(120)
              .nullable()
              .describe("Filtro de substring no caminho, ex.: 'supabase/functions' ou '.tsx'. Use null para listar tudo."),
          }),
          execute: async ({ filter }) => {
            const ref = await loadRepoRef();
            if (!ref || !repoAvailable()) {
              return { ok: false, error: "Repositório do projeto não configurado na Central de Evolução." };
            }
            try {
              const all = await listRepoFiles(ref);
              const f = (filter ?? "").trim().toLowerCase();
              const paths = (f ? all.filter((p) => p.toLowerCase().includes(f)) : all).slice(0, 400);
              return { ok: true, repo: `${ref.owner}/${ref.repo}@${ref.branch}`, count: paths.length, paths };
            } catch (e) {
              return { ok: false, error: e instanceof Error ? e.message : "Falha ao listar arquivos." };
            }
          },
        }),
        read_project_file: tool({
          description:
            "Lê o conteúdo de um arquivo do código-fonte deste sistema. Caminho relativo à raiz do repositório.",
          inputSchema: z.object({
            path: z.string().min(1).max(300).describe("Ex.: src/pages/Workspace.tsx"),
          }),
          execute: async ({ path }) => {
            const ref = await loadRepoRef();
            if (!ref || !repoAvailable()) {
              return { ok: false, error: "Repositório do projeto não configurado na Central de Evolução." };
            }
            try {
              const file = await readRepoFile(ref, path);
              return { ok: true, ...file };
            } catch (e) {
              return { ok: false, error: e instanceof Error ? e.message : "Falha ao ler o arquivo." };
            }
          },
        }),
        search_project_code: tool({
          description:
            "Busca um texto no código-fonte deste sistema e devolve os trechos com arquivo e linha.",
          inputSchema: z.object({
            query: z.string().min(2).max(120).describe("Texto literal a procurar."),
            pathGlob: z
              .string()
              .max(120)
              .nullable()
              .describe("Glob opcional para limitar a busca, ex.: 'src/**' ou 'supabase/functions/**'. null = todo o repo."),
          }),
          execute: async ({ query, pathGlob }) => {
            const ref = await loadRepoRef();
            if (!ref || !repoAvailable()) {
              return { ok: false, error: "Repositório do projeto não configurado na Central de Evolução." };
            }
            try {
              const hits = await searchRepo(ref, query, { pathGlob: pathGlob ?? undefined });
              return { ok: true, count: hits.length, hits };
            } catch (e) {
              return { ok: false, error: e instanceof Error ? e.message : "Falha na busca." };
            }
          },
        }),
        create_file: tool({
          description:
            "Cria um arquivo baixável para a usuária (PDF, PNG, markdown, CSV, código, SVG, HTML, txt). Para pdf/png, content deve ser HTML completo com estilos inline.",
          inputSchema: z.object({
            title: z.string().min(1).max(120).describe("Nome do arquivo, sem extensão."),
            format: z
              .enum(["pdf", "png", "markdown", "csv", "code", "svg", "html", "txt"])
              .describe("Formato final do arquivo."),
            content: z.string().min(1).max(200000).describe("Conteúdo: HTML para pdf/png, texto bruto nos outros."),
            language: z
              .string()
              .max(30)
              .nullable()
              .describe("Linguagem quando format = code (ex.: 'typescript'). null nos outros casos."),
          }),
          execute: async ({ title, format, content, language }) => {
            const { data, error } = await supabase
              .from("artifacts")
              .insert({
                user_id: userId,
                thread_id: threadId ?? null,
                kind: format,
                title,
                language: language ?? null,
                content,
                metadata: { format },
              })
              .select("id")
              .single();
            if (error) {
              console.error("create_file insert failed", error);
              return { ok: false, error: error.message };
            }
            return { ok: true, id: data.id, title, format, note: "Arquivo disponível no painel Arquivos." };
          },
        }),
        remember: tool({
          description:
            "Save a durable piece of knowledge about the user to long-term memory. Call this when the user states a preference, a correction, a personal fact, or teaches a reusable skill. Do not call it for transient conversation.",
          inputSchema: z.object({
            content: z
              .string()
              .min(1)
              .max(500)
              .describe("The fact/preference/correction, phrased as a durable statement about the user."),
            kind: z
              .enum(["preference", "style", "fact", "correction", "skill"])
              .describe("preference: how they like things; style: writing/tone; fact: about them or their work; correction: fixing a past mistake; skill: a reusable capability."),
            importance: z
              .number()
              .int()
              .min(1)
              .max(10)
              .default(5)
              .describe("1-10. Core identity/facts = 9-10; strong preferences = 7-8; minor = 3-5."),
          }),
          execute: async ({ content, kind, importance }) => {
            const { error } = await supabase.from("user_memories").insert({
              user_id: userId,
              content,
              kind,
              importance,
              active: true,
              source_thread_id: threadId ?? null,
            });
            if (error) {
              console.error("remember tool insert failed", error);
              return { ok: false, error: error.message };
            }
            return { ok: true, saved: { content, kind, importance } };
          },
        }),
      },
    });


    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      headers: corsHeaders,
      onError: (error) => {
        console.error("chat stream error", error);
        const msg = error instanceof Error ? error.message : String(error);
        if (/too large|context length|rate limit|tokens per/i.test(msg)) {
          return "Esta conversa ficou grande demais para o modelo gratuito. Comece uma nova conversa (ou aguarde um minuto) e tente novamente.";
        }
        return msg || "Something went wrong generating a reply.";
      },

    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return new Response(null, { status: 499, headers: corsHeaders });
    }
    console.error("chat error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
