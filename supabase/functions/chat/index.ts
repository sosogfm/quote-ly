import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamText, convertToModelMessages, type UIMessage } from "npm:ai@7";
import { createOpenAI } from "npm:@ai-sdk/openai@4";

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
- Never invent facts, citations, APIs, or file contents. Say when you're unsure.`;

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

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI is not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const messages = (body?.messages ?? []) as UIMessage[];
    const projectInstructions: string | undefined = body?.projectInstructions;

    const initialRunId = req.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
    const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: lovableApiKey,
      headers: {
        "Lovable-API-Key": lovableApiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      fetch: runIdFetch.fetch as typeof fetch,
    });

    const system = projectInstructions
      ? `${SYSTEM_PROMPT}\n\nProject context and standing instructions from the user:\n${projectInstructions}`
      : SYSTEM_PROMPT;

    const result = streamText({
      model: lovable.responses("openai/gpt-5.6-sol"),
      system,
      messages: await convertToModelMessages(messages),
      abortSignal: req.signal,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "medium",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: true,
      headers: corsHeaders,
      onError: (error) => {
        console.error("chat stream error", error);
        return error instanceof Error ? error.message : "Something went wrong generating a reply.";
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
