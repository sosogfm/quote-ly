import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateText } from "npm:ai@7";
import { generateWithFallback, describeAiError } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate JWT - only authenticated users can use AI content
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sectionTitle, sectionContent, templateCategory, proposalTitle } = await req.json();

    if (!Deno.env.get("GROQ_API_KEY") && !Deno.env.get("OPENROUTER_API_KEY") && !Deno.env.get("LOVABLE_API_KEY")) {
      throw new Error("No AI provider configured");
    }

    const systemPrompt = `You are an expert business proposal writer. Your job is to improve proposal section content to be more professional, persuasive, and clear.
Keep the same general meaning but make it:
- More professional and polished
- More persuasive and client-focused
- Well-structured with clear language
- Concise but comprehensive

Context: This is for a "${templateCategory || "general"}" proposal titled "${proposalTitle || "Untitled"}".
Section: "${sectionTitle || "Untitled Section"}"

Return ONLY the improved content text. No explanations, no markdown headers, just the improved section content.`;

    try {
      const { text } = await generateWithFallback({}, (model) =>
        generateText({
          model,
          system: systemPrompt,
          prompt: sectionContent || "Write initial content for this section.",
        }),
      );

      return new Response(JSON.stringify({ content: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      const { message, status } = describeAiError(err);
      console.error("ai-content error:", (err as Error)?.message);
      return new Response(JSON.stringify({ error: message }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("ai-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
