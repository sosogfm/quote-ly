import { corsHeaders } from "../_shared/evolution.ts";
import { getAiProviderInfo } from "../_shared/ai-provider.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const info = getAiProviderInfo();
  return new Response(JSON.stringify(info), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
