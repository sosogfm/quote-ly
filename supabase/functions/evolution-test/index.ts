import { corsHeaders, json, requireAdmin } from "../_shared/evolution.ts";
import { getChatModel, describeAiError } from "../_shared/ai-provider.ts";
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

const SYSTEM_PROMPT = `Você é um revisor de código sênior. Você recebe uma proposta de mudança de sistema com arquivos alterados (patches) e deve SIMULAR a execução de testes sobre o patch.

Para cada teste, verifique estaticamente o patch e decida "passed" ou "failed" com justificativa objetiva em português. Cubra no mínimo:
- Sintaxe e consistência do patch (imports, tipos, parênteses, hooks React corretos).
- Segurança (RLS, segredos, validação de entrada, exposição de dados).
- Regressão (o patch quebra comportamento existente aparente?).

Seja honesto: se algo parece quebrado, marque "failed" e explique. Gere entre 2 e 6 testes. Não invente arquivos fora do patch. Responda apenas o JSON pedido.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) return auth.error;
    const { supabase, userId } = auth;

    const body = await req.json().catch(() => null);
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    if (!taskId) return json({ error: "Proposta não informada." }, 400);

    const [taskRes, filesRes] = await Promise.all([
      supabase
        .from("dev_tasks")
        .select("id, title, problem, solution, state, risk_level, source")
        .eq("id", taskId)
        .eq("source", "evolution")
        .maybeSingle(),
      supabase
        .from("dev_task_files")
        .select("path, change_type, patch")
        .eq("task_id", taskId)
        .order("path"),
    ]);

    if (taskRes.error || !taskRes.data) return json({ error: "Proposta não encontrada." }, 404);
    const task = taskRes.data;
    const files = filesRes.data ?? [];

    if (files.length === 0) {
      return json({ error: "Esta proposta não tem patches para testar." }, 400);
    }

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
        system: SYSTEM_PROMPT,
        prompt: `Proposta: ${task.title}\n\nProblema: ${task.problem ?? "-"}\n\nSolução: ${task.solution ?? "-"}\n\nArquivos alterados:\n\n${filesBlock}`,
      });
      output = TestPlanSchema.parse(result.output);
    } catch (err) {
      console.error("evolution-test IA erro:", (err as Error)?.message);
      const { message, status } = describeAiError(err);
      return json({ error: message }, status);
    }

    // Replace previous auto-generated runs: delete old pending ones not executed by a human.
    await supabase
      .from("evolution_test_runs")
      .delete()
      .eq("task_id", taskId)
      .is("executed_by", null);

    const now = new Date().toISOString();
    const rows = output.tests.map((t) => ({
      task_id: taskId,
      name: t.name.slice(0, 120),
      required: t.required,
      result: t.result,
      output: `${t.output}\n\n— Análise estática por IA (simulada)`,
      executed_at: now,
    }));

    const { error: insertError } = await supabase.from("evolution_test_runs").insert(rows);
    if (insertError) return json({ error: "Não foi possível salvar os testes." }, 500);

    const failed = rows.filter((r) => r.result === "failed").length;
    await supabase.from("dev_task_events").insert({
      task_id: taskId,
      user_id: userId,
      action: "ai_tests_run",
      detail: {
        summary: output.summary,
        total: rows.length,
        failed,
      },
      simulated: true,
    });

    return json({ ok: true, summary: output.summary, total: rows.length, failed });
  } catch (err) {
    console.error("evolution-test erro:", (err as Error)?.message);
    return json({ error: "Erro inesperado." }, 500);
  }
});
