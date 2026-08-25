// Shared logic for the Central de Evolução edge functions.
// Kept in sync with src/lib/evolution/* (state machine + contract).
import { z } from "npm:zod";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const FORBIDDEN_PATHS = [
  ".env",
  "src/integrations/supabase/client.ts",
  "src/integrations/supabase/types.ts",
  "src/integrations/supabase/previewAuthStorage.ts",
  "supabase/config.toml",
];

export function isForbiddenPath(path: string): boolean {
  const p = path.trim().replace(/^\.\//, "");
  return FORBIDDEN_PATHS.some((f) => p === f || p.endsWith(`/${f}`));
}

const SENSITIVE_PATTERNS = [
  /user_roles/i,
  /\brls\b/i,
  /row level security/i,
  /has_role/i,
  /auth\.uid/i,
  /service_role/i,
  /audit_logs/i,
  /\bsecret/i,
  /\bpolicy\b/i,
  /autentica|autoriza|permiss/i,
];

export function touchesSensitiveArea(text: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

export const ProposalOutputSchema = z.object({
  title: z.string(),
  problem: z.string(),
  evidence: z.array(z.string()),
  solution: z.string(),
  impact: z.string(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  risks: z.array(z.string()),
  rollbackPlan: z.string(),
  requiresMigration: z.boolean(),
  estimatedCost: z.string(),
  tests: z.array(z.string()),
  affectedFiles: z.array(
    z.object({
      path: z.string(),
      changeType: z.enum(["created", "modified", "deleted"]),
      reason: z.string(),
      language: z.string(),
      patch: z.string(),
    }),
  ),
});

export type ProposalState =
  | "awaiting_review"
  | "needs_revision"
  | "approved"
  | "rejected"
  | "deployed"
  | "rolled_back"
  | "cancelled";

export type EvolutionAction =
  | "approve"
  | "reject"
  | "request_revision"
  | "record_test"
  | "confirm_migration"
  | "mark_applied"
  | "rollback"
  | "cancel";

const TRANSITIONS: Record<string, { from: ProposalState[]; to: ProposalState }> = {
  approve: { from: ["awaiting_review", "needs_revision"], to: "approved" },
  reject: { from: ["awaiting_review", "needs_revision"], to: "rejected" },
  request_revision: { from: ["awaiting_review", "approved"], to: "needs_revision" },
  mark_applied: { from: ["approved"], to: "deployed" },
  rollback: { from: ["deployed"], to: "rolled_back" },
  cancel: { from: ["awaiting_review", "needs_revision", "approved"], to: "cancelled" },
};

export function nextState(action: string, from: ProposalState): ProposalState | null {
  const t = TRANSITIONS[action];
  if (!t) return null;
  return t.from.includes(from) ? t.to : null;
}

export type ApplyContext = {
  state: ProposalState;
  riskLevel: string | null;
  approvedAt: string | null;
  requiresMigration: boolean;
  migrationConfirmedAt: string | null;
  tests: { required: boolean; result: string }[];
};

export function canApply(ctx: ApplyContext): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (ctx.state !== "approved") reasons.push("A proposta precisa estar aprovada.");
  if (!ctx.approvedAt) reasons.push("Nenhuma aprovação humana registrada.");
  const required = ctx.tests.filter((t) => t.required);
  if (required.some((t) => t.result === "failed")) reasons.push("Há teste obrigatório reprovado.");
  if (required.some((t) => t.result === "pending")) reasons.push("Há teste obrigatório pendente.");
  if (ctx.requiresMigration && !ctx.migrationConfirmedAt) {
    reasons.push("Alteração de banco exige confirmação adicional.");
  }
  if (ctx.riskLevel === "critical") {
    reasons.push("Risco crítico: apenas recomendação manual nesta etapa.");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Validates the bearer token and confirms the caller is an admin in the DB. */
export async function requireAdmin(req: Request) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: json({ error: "Unauthorized" }, 401) } as const;
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
  if (authError || !claimsData?.claims) {
    return { error: json({ error: "Unauthorized" }, 401) } as const;
  }
  const userId = claimsData.claims.sub as string;
  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleError || !isAdmin) {
    return { error: json({ error: "Acesso restrito a administradores." }, 403) } as const;
  }
  return { supabase, userId } as const;
}
