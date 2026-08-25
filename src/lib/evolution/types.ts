import { z } from "zod";

export const EVOLUTION_SOURCE = "evolution" as const;

export type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Risco baixo",
  medium: "Risco médio",
  high: "Risco alto",
  critical: "Risco crítico",
};

/** States used by the Central de Evolução (subset of dev_task_state). */
export type ProposalState =
  | "awaiting_review"
  | "needs_revision"
  | "approved"
  | "rejected"
  | "deployed"
  | "rolled_back"
  | "cancelled";

export const STATE_LABELS: Record<ProposalState, string> = {
  awaiting_review: "Aguardando revisão",
  needs_revision: "Precisa de revisão",
  approved: "Aprovada",
  rejected: "Rejeitada",
  deployed: "Aplicada",
  rolled_back: "Revertida",
  cancelled: "Cancelada",
};

export type TestResult = "pending" | "passed" | "failed";

/** Paths the self-improvement engine may never touch. */
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

/** Topics that force critical risk and stay manual-only in Etapa 1. */
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

/** Structured output contract for the model. Kept flat and constraint-free. */
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

export type ProposalOutput = z.infer<typeof ProposalOutputSchema>;
