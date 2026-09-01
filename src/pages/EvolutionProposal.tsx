import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RiskBadge } from "@/components/evolution/RiskBadge";
import { StatusBadge } from "@/components/evolution/StatusBadge";
import { DiffViewer, type PatchFile } from "@/components/evolution/DiffViewer";
import { ProposalTimeline, type TimelineEvent } from "@/components/evolution/ProposalTimeline";
import { ApproveDialog } from "@/components/evolution/ApproveDialog";
import { supabase } from "@/integrations/supabase/client";
import { isTransitionAllowed } from "@/lib/evolution/transitions";
import type { ProposalState, RiskLevel, TestResult } from "@/lib/evolution/types";
import { toast } from "sonner";
import {
  ArrowLeft,
  Database,
  Loader2,
  Github,
  RotateCcw,
  ShieldAlert,
  Undo2,
} from "lucide-react";

type TaskRow = {
  id: string;
  title: string;
  request: string | null;
  problem: string | null;
  evidence: unknown;
  solution: string | null;
  impact: string | null;
  state: string;
  risk_level: string | null;
  risks: unknown;
  rollback_plan: string | null;
  estimated_cost: string | null;
  requires_migration: boolean;
  migration_confirmed_at: string | null;
  applied_at: string | null;
  github_pr_url: string | null;
  plan_approved_at: string | null;
  created_at: string;
};

type TestRun = {
  id: string;
  name: string;
  required: boolean;
  result: TestResult;
  output: string | null;
  executed_at: string | null;
};

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const RESULT_LABELS: Record<TestResult, string> = {
  pending: "Pendente",
  passed: "Passou",
  failed: "Falhou",
};

export default function EvolutionProposal() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<TaskRow | null>(null);
  const [files, setFiles] = useState<PatchFile[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [tests, setTests] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [reason, setReason] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [taskRes, filesRes, eventsRes, testsRes] = await Promise.all([
      supabase
        .from("dev_tasks")
        .select(
          "id, title, request, problem, evidence, solution, impact, state, risk_level, risks, rollback_plan, estimated_cost, requires_migration, migration_confirmed_at, applied_at, github_pr_url, plan_approved_at, created_at",
        )
        .eq("id", id)
        .eq("source", "evolution")
        .maybeSingle(),
      supabase
        .from("dev_task_files")
        .select("id, path, change_type, reason, language, patch")
        .eq("task_id", id)
        .order("path"),
      supabase
        .from("dev_task_events")
        .select("id, action, from_state, to_state, detail, created_at")
        .eq("task_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("evolution_test_runs")
        .select("id, name, required, result, output, executed_at")
        .eq("task_id", id)
        .order("created_at", { ascending: true }),
    ]);

    setTask((taskRes.data ?? null) as TaskRow | null);
    setFiles((filesRes.data ?? []) as PatchFile[]);
    setEvents((eventsRes.data ?? []) as TimelineEvent[]);
    setTests((testsRes.data ?? []) as TestRun[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!id) return;
    setActing(true);
    const { data, error } = await supabase.functions.invoke("evolution-action", {
      body: { action, taskId: id, reason, ...extra },
    });
    setActing(false);

    if (error) {
      toast.error("Não foi possível concluir a ação.");
      return;
    }
    if (data && typeof data === "object" && "error" in data) {
      toast.error(String((data as { error: string }).error));
      return;
    }
    toast.success("Ação registrada.");
    setReason("");
    setApproveOpen(false);
    load();
  };

  const applyToGithub = async () => {
    if (!id) return;
    setActing(true);
    const { data, error } = await supabase.functions.invoke("evolution-apply", {
      body: { taskId: id },
    });
    setActing(false);

    if (error) {
      let message = "Não foi possível abrir o Pull Request.";
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          const parsed = await ctx.json();
          if (parsed?.error) message = String(parsed.error);
        }
      } catch {
        /* keeps the generic message */
      }
      toast.error(message);
      return;
    }
    if (data && typeof data === "object" && "error" in data) {
      toast.error(String((data as { error: string }).error));
      return;
    }
    toast.success("Pull Request aberto no GitHub.");
    load();
  };

  const runAiTests = async () => {
    if (!id) return;
    setActing(true);
    const { data, error } = await supabase.functions.invoke("evolution-test", {
      body: { taskId: id },
    });
    setActing(false);

    if (error) {
      let message = "Não foi possível rodar os testes automáticos.";
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          const parsed = await ctx.json();
          if (parsed?.error) message = String(parsed.error);
        }
      } catch {
        /* keeps the generic message */
      }
      toast.error(message);
      return;
    }
    if (data && typeof data === "object" && "error" in data) {
      toast.error(String((data as { error: string }).error));
      return;
    }
    const failed = (data as { failed?: number })?.failed ?? 0;
    toast[failed > 0 ? "warning" : "success"](
      failed > 0 ? `Testes concluídos: ${failed} falharam.` : "Todos os testes passaram.",
    );
    load();
  };


  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!task) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">Proposta não encontrada.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/evolution")}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const state = task.state as ProposalState;
  const risk = (task.risk_level ?? "medium") as RiskLevel;
  const evidence = asList(task.evidence);
  const risks = asList(task.risks);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/evolution")}>
          <ArrowLeft className="h-4 w-4" /> Central de Evolução
        </Button>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge state={state} />
            <RiskBadge level={risk} />
            {task.requires_migration && (
              <Badge variant="outline" className="gap-1">
                <Database className="h-3 w-3" /> Exige alteração de banco
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              Criada em {new Date(task.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
          <h1 className="text-2xl font-bold font-display">{task.title}</h1>
        </div>

        {risk === "critical" && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Risco crítico: esta proposta é apenas recomendação manual. A aplicação automática fica
              bloqueada nesta etapa.
            </span>
          </div>
        )}

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="diff">Diff ({files.length})</TabsTrigger>
            <TabsTrigger value="tests">Testes ({tests.length})</TabsTrigger>
            <TabsTrigger value="rollback">Rollback</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            {[
              { title: "Problema", body: task.problem },
              { title: "Solução proposta", body: task.solution },
              { title: "Impacto esperado", body: task.impact },
              { title: "Custo estimado", body: task.estimated_cost },
            ]
              .filter((s) => s.body)
              .map((s) => (
                <Card key={s.title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{s.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>
                  </CardContent>
                </Card>
              ))}

            {evidence.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Evidências</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {risks.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Riscos identificados</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="diff" className="pt-4">
            <DiffViewer files={files} />
          </TabsContent>

          <TabsContent value="tests" className="space-y-3 pt-4">
            {tests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum teste definido nesta proposta.</p>
            ) : (
              tests.map((t) => (
                <Card key={t.id}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{t.name}</span>
                      {t.required && (
                        <Badge variant="outline" className="text-[10px]">
                          obrigatório
                        </Badge>
                      )}
                      <Badge
                        variant={
                          t.result === "passed"
                            ? "default"
                            : t.result === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                        className="ml-auto text-[10px]"
                      >
                        {RESULT_LABELS[t.result]}
                      </Badge>
                    </div>
                    {t.output && (
                      <pre className="max-h-40 overflow-auto rounded bg-muted/50 p-2 text-xs">
                        {t.output}
                      </pre>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting}
                        onClick={() =>
                          runAction("record_test", { runId: t.id, result: "passed" })
                        }
                      >
                        Marcar como passou
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting}
                        onClick={() =>
                          runAction("record_test", { runId: t.id, result: "failed" })
                        }
                      >
                        Marcar como falhou
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="rollback" className="pt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Plano de rollback</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {task.rollback_plan ?? "Nenhum plano informado."}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            <ProposalTimeline events={events} />
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Decisão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Justificativa (obrigatória para rejeitar ou pedir revisão)"
              rows={3}
            />

            {task.requires_migration && !task.migration_confirmed_at && (
              <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <Checkbox
                  checked={false}
                  disabled={acting}
                  onCheckedChange={() => runAction("confirm_migration")}
                />
                <span className="text-muted-foreground">
                  Confirmo que revisei a alteração de banco de dados desta proposta.
                </span>
              </label>
            )}

            {task.github_pr_url && (
              <a
                href={task.github_pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm hover:border-primary/50"
              >
                <Github className="h-4 w-4" />
                Pull Request aberto no GitHub — abrir para revisar e fazer o merge
              </a>
            )}

            <div className="flex flex-wrap gap-2">
              {state === "approved" && !task.github_pr_url && risk !== "critical" && (
                <Button disabled={acting} onClick={applyToGithub}>
                  {acting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Github className="mr-2 h-4 w-4" />
                  )}
                  Aplicar via GitHub (abrir PR)
                </Button>
              )}

              {isTransitionAllowed("approve", state) && (
                <Button disabled={acting} onClick={() => setApproveOpen(true)}>
                  Aprovar
                </Button>
              )}
              {isTransitionAllowed("request_revision", state) && (
                <Button
                  variant="outline"
                  disabled={acting}
                  onClick={() => runAction("request_revision")}
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Pedir revisão
                </Button>
              )}
              {isTransitionAllowed("reject", state) && (
                <Button variant="outline" disabled={acting} onClick={() => runAction("reject")}>
                  Rejeitar
                </Button>
              )}
              {isTransitionAllowed("mark_applied", state) && (
                <Button
                  variant="secondary"
                  disabled={acting}
                  onClick={() => runAction("mark_applied")}
                >
                  Marcar como aplicada
                </Button>
              )}
              {isTransitionAllowed("rollback", state) && (
                <Button variant="destructive" disabled={acting} onClick={() => runAction("rollback")}>
                  <Undo2 className="mr-2 h-4 w-4" /> Reverter
                </Button>
              )}
              {isTransitionAllowed("cancel", state) && (
                <Button variant="ghost" disabled={acting} onClick={() => runAction("cancel")}>
                  Cancelar proposta
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <ApproveDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        riskLevel={risk}
        loading={acting}
        onConfirm={() => runAction("approve")}
      />
    </DashboardLayout>
  );
}
