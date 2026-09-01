// Runs tests for an evolution proposal.
// Preferred mode: REAL — reads GitHub Actions check runs for the proposal's branch/PR.
// Fallback mode: STATIC — deterministic AI review (temperature 0) when there is no branch/CI yet.
import { corsHeaders, json, requireAdmin } from "../_shared/evolution.ts";
import { getChatModel, describeAiError } from "../_shared/ai-provider.ts";
import { gh, githubConfigured } from "../_shared/github.ts";
import { generateText, Output } from "npm:ai@7";
import { z } from "npm:zod";

const TestRunSchema = z.object({
  name: z.string().describe("Nome curto do teste"),
  required: z.boolean().describe("Se o teste é obrigatório para aplicar a proposta"),
  result: z.enum(["passed", "failed"]).describe("Resultado da análise estática"),
  output: z
    .string()
    .describe("Explicação curta do que foi verificado e do resultado (máx. ~400 caracteres)"),
});

const TestPlanSchema = z.object({
  summary: z.string().describe("Resumo de uma linha sobre a qualidade do patch"),
  tests: z.array(TestRunSchema).describe("Entre 2 e 6 testes"),
});

const SYSTEM_PROMPT = `Você é um revisor de código sênior e DETERMINÍSTICO. Você recebe uma proposta de mudança com arquivos alterados (patches) e faz uma revisão estática.

Gere SEMPRE exatamente estes 4 testes, nesta ordem e com estes nomes exatos:
1. "Sintaxe e tipos" — imports, tipos, parênteses, hooks React corretos.
2. "Segurança" — RLS, segredos, validação de entrada, exposição de dados.
3. "Regressão aparente" — o patch quebra comportamento existente?
4. "Escopo do patch" — muda apenas o necessário, sem arquivos fora do escopo.

Para cada um responda "passed" ou "failed" com justificativa objetiva em português, citando linha/arquivo quando falhar. Se não houver evidência de problema, o resultado é "passed" (não especule). required = true para "Sintaxe e tipos" e "Segurança", false nos outros. Responda apenas o JSON pedido.`;

type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
  started_at: string | null;
  completed_at: string | null;
};

function mapConclusion(run: CheckRun): "passed" | "failed" | "pending" {
  if (run.status !== "completed") return "pending";
  if (run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped") {
    return "passed";
  }
  return "failed";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) return auth.error;
    const { supabase, userId } = auth;

    const body = await req.json().catch(() => null);
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    if (!taskId) return json({ error: "Proposta não informada." }, 400);

    const [taskRes, filesRes, settingsRes] = await Promise.all([
      supabase
        .from("dev_tasks")
        .select(
          "id, title, problem, solution, state, risk_level, source, github_branch, github_pr_number, github_pr_url",
        )
        .eq("id", taskId)
        .eq("source", "evolution")
        .maybeSingle(),
      supabase
        .from("dev_task_files")
        .select("path, change_type, patch")
        .eq("task_id", taskId)
        .order("path"),
      supabase
        .from("evolution_repo_settings")
        .select("repo_owner, repo_name")
        .order("created_at")
        .limit(1)
        .maybeSingle(),
    ]);

    if (taskRes.error || !taskRes.data) return json({ error: "Proposta não encontrada." }, 404);
    const task = taskRes.data;
    const files = filesRes.data ?? [];
    const settings = settingsRes.data;

    if (files.length === 0) {
      return json({ error: "Esta proposta não tem patches para testar." }, 400);
    }

    const clearPrevious = async () => {
      await supabase
        .from("evolution_test_runs")
        .delete()
        .eq("task_id", taskId)
        .is("executed_by", null);
    };

    // ---------- REAL MODE: GitHub Actions on the proposal branch ----------
    if (task.github_branch && settings && githubConfigured()) {
      const repo = `${settings.repo_owner}/${settings.repo_name}`;
      try {
        const checks = await gh<{ total_count: number; check_runs: CheckRun[] }>(
          `repos/${repo}/commits/${encodeURIComponent(task.github_branch)}/check-runs?per_page=30`,
        );

        if ((checks?.check_runs?.length ?? 0) > 0) {
          const now = new Date().toISOString();
          const rows = checks.check_runs.map((run) => {
            const result = mapConclusion(run);
            return {
              task_id: taskId,
              name: run.name.slice(0, 120),
              required: true,
              result,
              output: [
                `CI real do GitHub Actions na branch \`${task.github_branch}\`.`,
                `Status: ${run.status}${run.conclusion ? ` / ${run.conclusion}` : ""}`,
                run.completed_at ? `Concluído em: ${run.completed_at}` : "",
                run.html_url ? `Logs: ${run.html_url}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
              executed_at: run.completed_at ?? now,
            };
          });

          await clearPrevious();
          const { error: insertError } = await supabase.from("evolution_test_runs").insert(rows);
          if (insertError) return json({ error: "Não foi possível salvar os testes." }, 500);

          const failed = rows.filter((r) => r.result === "failed").length;
          const pending = rows.filter((r) => r.result === "pending").length;
          const summary = pending
            ? `CI em andamento: ${pending} de ${rows.length} checks ainda rodando.`
            : failed
              ? `CI real: ${failed} de ${rows.length} checks falharam.`
              : `CI real: todos os ${rows.length} checks passaram.`;

          await supabase.from("dev_task_events").insert({
            task_id: taskId,
            user_id: userId,
            action: "ci_results_synced",
            detail: { summary, total: rows.length, failed, pending, branch: task.github_branch },
            simulated: false,
          });

          return json({ ok: true, mode: "real", summary, total: rows.length, failed, pending });
        }

        // Branch exists but no checks yet — try to kick off the workflow.
        try {
          await gh(`repos/${repo}/actions/workflows/ci.yml/dispatches`, {
            method: "POST",
            body: { ref: task.github_branch },
          });
          return json({
            ok: true,
            mode: "real",
            summary: `CI disparado na branch \`${task.github_branch}\`. Rode novamente em ~1 minuto para buscar os resultados.`,
            total: 0,
            failed: 0,
            pending: 1,
          });
        } catch (dispatchErr) {
          console.error("dispatch ci falhou:", (dispatchErr as Error)?.message);
          // fall through to static analysis
        }
      } catch (err) {
        console.error("evolution-test GitHub erro:", (err as Error)?.message);
        // fall through to static analysis
      }
    }

    // ---------- FALLBACK: deterministic static review ----------
    const filesBlock = files
      .map((f) => {
        const patch = typeof f.patch === "string" ? f.patch.slice(0, 6000) : "(sem patch)";
        return `### ${f.path} (${f.change_type})\n\`\`\`diff\n${patch}\n\`\`\``;
      })
      .join("\n\n")
      .slice(0, 18000);

    let output: z.infer<typeof TestPlanSchema>;
    try {
      const { model } = getChatModel({ structuredOutputs: true });
      const result = await generateText({
        model,
        output: Output.object({ schema: TestPlanSchema }),
        temperature: 0,
        seed: 7,
        system: SYSTEM_PROMPT,
        prompt: `Proposta: ${task.title}\n\nProblema: ${task.problem ?? "-"}\n\nSolução: ${task.solution ?? "-"}\n\nArquivos alterados:\n\n${filesBlock}`,
      });
      output = TestPlanSchema.parse(result.output);
    } catch (err) {
      console.error("evolution-test IA erro:", (err as Error)?.message);
      const { message, status } = describeAiError(err);
      return json({ error: message }, status);
    }

    await clearPrevious();

    const now = new Date().toISOString();
    const rows = output.tests.map((t) => ({
      task_id: taskId,
      name: t.name.slice(0, 120),
      required: t.required,
      result: t.result,
      output: `${t.output}\n\n— Revisão estática determinística (sem CI real ainda: abra o Pull Request para rodar os testes de verdade)`,
      executed_at: now,
    }));

    const { error: insertError } = await supabase.from("evolution_test_runs").insert(rows);
    if (insertError) return json({ error: "Não foi possível salvar os testes." }, 500);

    const failed = rows.filter((r) => r.result === "failed").length;
    await supabase.from("dev_task_events").insert({
      task_id: taskId,
      user_id: userId,
      action: "ai_tests_run",
      detail: { summary: output.summary, total: rows.length, failed },
      simulated: true,
    });

    return json({
      ok: true,
      mode: "static",
      summary: output.summary,
      total: rows.length,
      failed,
      pending: 0,
    });
  } catch (err) {
    console.error("evolution-test erro:", (err as Error)?.message);
    return json({ error: "Erro inesperado." }, 500);
  }
});
