import type { ProposalState, RiskLevel, TestResult } from "./types";

export type EvolutionAction =
  | "approve"
  | "reject"
  | "request_revision"
  | "mark_applied"
  | "rollback"
  | "cancel";

const TRANSITIONS: Record<EvolutionAction, { from: ProposalState[]; to: ProposalState }> = {
  approve: { from: ["awaiting_review", "needs_revision"], to: "approved" },
  reject: { from: ["awaiting_review", "needs_revision"], to: "rejected" },
  request_revision: { from: ["awaiting_review", "approved"], to: "needs_revision" },
  mark_applied: { from: ["approved"], to: "deployed" },
  rollback: { from: ["deployed"], to: "rolled_back" },
  cancel: { from: ["awaiting_review", "needs_revision", "approved"], to: "cancelled" },
};

export function nextState(action: EvolutionAction, from: ProposalState): ProposalState | null {
  const t = TRANSITIONS[action];
  if (!t) return null;
  return t.from.includes(from) ? t.to : null;
}

export function isTransitionAllowed(action: EvolutionAction, from: ProposalState): boolean {
  return nextState(action, from) !== null;
}

export type ApplyContext = {
  state: ProposalState;
  riskLevel: RiskLevel;
  approvedAt: string | null;
  requiresMigration: boolean;
  migrationConfirmedAt: string | null;
  tests: { required: boolean; result: TestResult }[];
};

/** Server-side gate for "mark as applied". Returns every blocking reason. */
export function canApply(ctx: ApplyContext): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (ctx.state !== "approved") {
    reasons.push("A proposta precisa estar aprovada.");
  }
  if (!ctx.approvedAt) {
    reasons.push("Nenhuma aprovação humana registrada.");
  }
  const required = ctx.tests.filter((t) => t.required);
  if (required.some((t) => t.result === "failed")) {
    reasons.push("Há teste obrigatório reprovado.");
  }
  if (required.some((t) => t.result === "pending")) {
    reasons.push("Há teste obrigatório pendente.");
  }
  if (ctx.requiresMigration && !ctx.migrationConfirmedAt) {
    reasons.push("Alteração de banco exige confirmação adicional.");
  }
  if (ctx.riskLevel === "critical") {
    reasons.push("Risco crítico: apenas recomendação manual nesta etapa.");
  }

  return { ok: reasons.length === 0, reasons };
}

/** High/critical risk approvals require typing a confirmation word. */
export function requiresSecondConfirmation(risk: RiskLevel): boolean {
  return risk === "high" || risk === "critical";
}

export const CONFIRMATION_WORD = "APROVAR";
