import { createClient } from "https://esm.sh/@supabase/supabase-js";

/**
 * Edge Function: excluir conversa.
 * Recebe { conversationId } no corpo da requisição.
 * Verifica a sessão do usuário via token JWT no header Authorization.
 * Utiliza o cliente Supabase com a chave anon e define o token do usuário,
 * garantindo que as políticas RLS sejam aplicadas.
 */
export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Extrai token JWT do header Authorization (formato: "Bearer <token>")
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { conversationId } = payload;
  if (!conversationId) {
    return new Response("conversationId is required", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

  // Define o token do usuário para que as políticas RLS sejam avaliadas
  supabase.auth.setAuth(token);

  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", conversationId);

  if (error) {
    console.error("Error deleting conversation:", error);
    return new Response(error.message, { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
