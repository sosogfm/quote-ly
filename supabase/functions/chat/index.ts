import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
} from "npm:ai@7";
import { getChatModel } from "../_shared/ai-provider.ts";
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

const SYSTEM_PROMPT = `You are the user's personal AI workspace assistant — a thoughtful, capable collaborator in the spirit of a senior engineer and a sharp writer combined.

Your job is to help with three kinds of work:
1. Documents and writing — proposals, reports, briefs, plans. Structure output with clear markdown headings, tight prose, no filler.
2. Code — write complete, runnable code in fenced blocks with the language tag. Prefer clarity over cleverness. Explain trade-offs briefly, not exhaustively.
3. Thinking and planning — break hard problems into steps, surface assumptions, name the risks.

Principles:
- Be direct. Skip preamble and self-congratulation.
- Ask a clarifying question only when the answer would meaningfully change the output.
- When the user corrects you, adopt the correction for the rest of the conversation.
- Use markdown for structure: headings, lists, tables, and fenced code blocks.
- Never invent facts, citations, APIs, or file contents. Say when you're unsure.

## Long-term memory
You have access to the user's long-term memory — personal facts, preferences, writing style, past corrections, and skills they've taught you. Use it to tailor every reply: match their writing style, honor their preferences, and never repeat a correction they already gave. Treat memory as truth unless the user explicitly updates it.

When the user states a durable preference, a correction, a personal fact, or teaches you a reusable skill, call the \`remember\` tool to save it. Call it once per distinct item, not for transient chit-chat. If the user corrects something you previously got wrong, save the correction (kind: "correction") and let it override older memory.`;

interface MemoryContext {
  summary: string | null;
  writingStyle: string | null;
  memories: { kind: string; content: string; importance: number }[];
  recentThreads: { title: string; updatedAt: string }[];
}

async function loadMemoryContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<MemoryContext> {
  const [summaryRes, memoriesRes, threadsRes] = await Promise.all([
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

    if (!Deno.env.get("GROQ_API_KEY") && !Deno.env.get("LOVABLE_API_KEY")) {
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

    const { model, provider, modelId } = getChatModel({ fetch: runIdFetch.fetch as typeof fetch });
    console.log("chat: using provider", provider, modelId);

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
        ? m.parts.filter((p) => p.type !== "reasoning")
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
      stopWhen: stepCountIs(4),
      tools: {
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
