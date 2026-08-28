import { describe, expect, it } from "vitest";
import {
  canApply,
  isTransitionAllowed,
  nextState,
  requiresSecondConfirmation,
  CONFIRMATION_WORD,
} from "@/lib/evolution/transitions";
import { isForbiddenPath, touchesSensitiveArea } from "@/lib/evolution/types";

describe("máquina de estados da Central de Evolução", () => {
  it("aprova somente a partir de revisão pendente ou revisão solicitada", () => {
    expect(nextState("approve", "awaiting_review")).toBe("approved");
    expect(nextState("approve", "needs_revision")).toBe("approved");
    expect(nextState("approve", "deployed")).toBeNull();
    expect(nextState("approve", "rejected")).toBeNull();
  });

  it("permite aplicar apenas propostas aprovadas", () => {
    expect(isTransitionAllowed("mark_applied", "approved")).toBe(true);
    expect(isTransitionAllowed("mark_applied", "awaiting_review")).toBe(false);
  });

  it("permite reverter apenas propostas aplicadas", () => {
    expect(nextState("rollback", "deployed")).toBe("rolled_back");
    expect(nextState("rollback", "approved")).toBeNull();
  });
});

describe("trava de aplicação", () => {
  const base = {
    state: "approved" as const,
    riskLevel: "low" as const,
    approvedAt: "2026-01-01T00:00:00Z",
    requiresMigration: false,
    migrationConfirmedAt: null,
    tests: [{ required: true, result: "passed" as const }],
  };

  it("libera quando tudo está em ordem", () => {
    expect(canApply(base).ok).toBe(true);
  });

  it("bloqueia sem aprovação humana registrada", () => {
    const result = canApply({ ...base, approvedAt: null });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("aprovação humana");
  });

  it("bloqueia com teste obrigatório pendente ou reprovado", () => {
    expect(canApply({ ...base, tests: [{ required: true, result: "pending" }] }).ok).toBe(false);
    expect(canApply({ ...base, tests: [{ required: true, result: "failed" }] }).ok).toBe(false);
  });

  it("bloqueia migração não confirmada", () => {
    expect(canApply({ ...base, requiresMigration: true }).ok).toBe(false);
    expect(
      canApply({
        ...base,
        requiresMigration: true,
        migrationConfirmedAt: "2026-01-02T00:00:00Z",
      }).ok,
    ).toBe(true);
  });

  it("bloqueia risco crítico", () => {
    expect(canApply({ ...base, riskLevel: "critical" }).ok).toBe(false);
  });
});

describe("confirmação extra e proteção de caminhos", () => {
  it("exige palavra de confirmação em risco alto e crítico", () => {
    expect(requiresSecondConfirmation("high")).toBe(true);
    expect(requiresSecondConfirmation("critical")).toBe(true);
    expect(requiresSecondConfirmation("medium")).toBe(false);
    expect(CONFIRMATION_WORD).toBe("APROVAR");
  });

  it("bloqueia arquivos protegidos", () => {
    expect(isForbiddenPath(".env")).toBe(true);
    expect(isForbiddenPath("./src/integrations/supabase/client.ts")).toBe(true);
    expect(isForbiddenPath("supabase/config.toml")).toBe(true);
    expect(isForbiddenPath("src/pages/Evolution.tsx")).toBe(false);
  });

  it("detecta áreas sensíveis", () => {
    expect(touchesSensitiveArea("ajustar policy de RLS na tabela user_roles")).toBe(true);
    expect(touchesSensitiveArea("melhorar espaçamento do card")).toBe(false);
  });
});
