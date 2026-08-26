import {
  corsHeaders,
  json,
  requireAdmin,
  nextState,
  canApply,
  type ProposalState,
} from "../_shared/evolution.ts";

const ALLOWED_ACTIONS = [
  "approve",
  "reject",
  "request_revision",
  "record_test",
  "confirm_migration",
  "mark_applied",
  "rollback",
  "cancel",
] as const;

type Action = (typeof ALLOWED_ACTIONS)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) return auth.error;
    const { supabase, userId } = auth;

    const body = await req.json().catch(() => null);
    const action = body?.action as Action;
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 2000) : "";

    if (!ALLOWED_ACTIONS.includes(action)) return json({ error: "Ação inválida." }, 400);
    if (!taskId) return json({ error: "Proposta não informada." }, 400);

    const { data: task, error: taskError } = await supabase
      .from("dev_tasks")
      .select(
        "id, state, risk_level, requires_migration, migration_confirmed_at, plan_approved_at, source",
      )
      .eq("id", taskId)
      .eq("source", "evolution")
      .maybeSingle();

    if (taskError || !task) return json({ error: "Proposta não encontrada." }, 404);

    const from = task.state as ProposalState;

    // --- Actions that do not change state ---
    if (action === "record_test") {
      const runId = typeof body?.runId === "string" ? body.runId : "";
      const result = body?.result;
      if (!runId || !["pending", "passed", "failed"].includes(result)) {
        return json({ error: "Resultado de teste inválido." }, 400);
      }
      const { error } = await supabase
        .from("evolution_test_runs")
        .update({
          result,
          output: typeof body?.output === "string" ? body.output.slice(0, 5000) : null,
          executed_by: userId,
          executed_at: new Date().toISOString(),
        })
        .eq("id", runId)
        .eq("task_id", taskId);
      if (error) return json({ error: "Não foi possível registrar o teste." }, 500);

      await supabase.from("dev_task_events").insert({
        task_id: taskId,
        user_id: userId,
        action: "test_recorded",
        detail: { runId, result },
        simulated: true,
      });
      return json({ ok: true });
    }

    if (action === "confirm_migration") {
      if (!task.requires_migration) {
        return json({ error: "Esta proposta não exige alteração de banco." }, 400);
      }
      await supabase
        .from("dev_tasks")
        .update({ migration_confirmed_at: new Date().toISOString() })
        .eq("id", taskId);
      await supabase.from("dev_task_events").insert({
        task_id: taskId,
        user_id: userId,
        action: "migration_confirmed",
        simulated: true,
      });
      return json({ ok: true });
    }

    // --- State transitions ---
    const to = nextState(action, from);
    if (!to) {
      return json({ error: `Transição não permitida a partir de "${from}".` }, 409);
    }

    if ((action === "reject" || action === "request_revision") && reason.trim().length < 5) {
      return json({ error: "Informe uma justificativa." }, 400);
    }

    if (action === "mark_applied") {
      const { data: runs } = await supabase
        .from("evolution_test_runs")
        .select("required, result")
        .eq("task_id", taskId);
      const gate = canApply({
        state: from,
        riskLevel: task.risk_level,
        approvedAt: task.plan_approved_at,
        requiresMigration: !!task.requires_migration,
        migrationConfirmedAt: task.migration_confirmed_at,
        tests: (runs ?? []).map((r) => ({ required: !!r.required, result: r.result as string })),
      });
      if (!gate.ok) return json({ error: gate.reasons.join(" ") , reasons: gate.reasons }, 409);
    }

    const patch: Record<string, unknown> = { state: to };
    const now = new Date().toISOString();
    if (action === "approve") {
      patch.plan_approved_at = now;
      patch.plan_approved_by = userId;
    }
    if (action === "request_revision" || action === "reject") {
      patch.plan_approved_at = null;
      patch.plan_approved_by = null;
    }
    if (action === "mark_applied") {
      patch.applied_at = now;
      patch.applied_by = userId;
    }

    const { error: updateError } = await supabase.from("dev_tasks").update(patch).eq("id", taskId);
    if (updateError) return json({ error: "Não foi possível atualizar a proposta." }, 500);

    if (action === "mark_applied" || action === "rollback") {
      await supabase
        .from("dev_task_files")
        .update({ applied: action === "mark_applied", reverted: action === "rollback" })
        .eq("task_id", taskId);
    }

    await supabase.from("dev_task_events").insert({
      task_id: taskId,
      user_id: userId,
      action,
      from_state: from,
      to_state: to,
      detail: reason ? { reason } : {},
      simulated: true,
    });

    return json({ ok: true, state: to });
  } catch (err) {
    console.error("evolution-action erro:", (err as Error)?.message);
    return json({ error: "Erro inesperado." }, 500);
  }
});
