// Auto-corrects an evolution proposal's patches based on failed test runs.
// Called after tests detect problems: the AI rewrites the diffs (or proposes an
// alternative approach) and the new patches replace the previous ones.
import { corsHeaders, json, requireAdmin, isForbiddenPath } from "../_shared/evolution.ts";
import { generateWithFallback, describeAiError } from "../_shared/ai-provider.ts";
import { generateText, Output } from "npm:ai@7";
import { z } from "npm:zod";

const FileSchema = z.object({
  path: z.string().describe("Caminho do arquivo no repositório"),
  change_type: z.enum(["create", "modify", "delete"]).describe("Tipo de mudança"),
  reason: z.string().describe("Por que este arquivo muda / o que foi corrigido"),
  language: z.string().describe("Linguagem do arquivo, ex: ts, tsx, sql, md"),
  patch: z.string().describe("Diff unificado completo e aplicável do arquivo corrigido"),
});

const FixSchema = z.object({
  summary: z.string().describe("Resumo em uma linha do que foi corrigido"),
  approach_changed: z
    .boolean()
    .describe("true se foi necessário mudar a abordagem em vez de só corrigir detalhes"),
  notes: z.string().describe("Explicação curta das correções ou da alternativa adotada"),
  files: z.array(FileSchema).describe("Todos os arquivos da proposta corrigida"),
});

const SYSTEM_PROMPT = `Você é um engenheiro sênior corrigindo uma proposta de mudança de código que FALHOU nos testes.

Regras:
- Corrija as causas apontadas pelos testes que falharam. Se a abordagem original for inviável, proponha uma ALTERNATIVA mais simples e segura (marque approach_changed = true).
- Devolva SEMPRE o conjunto completo de arquivos da proposta corrigida (não só o que mudou), com diffs unificados aplicáveis.
- Nunca toque em: .env, segredos, chaves, arquivos gerados automaticamente do backend, configuração de autenticação ou políticas RLS sem que a proposta já pedisse isso.
- Mantenha o escopo mínimo: não refatore o que não é necessário.
- Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui, backend em Edge Functions (Deno) e Postgres.
- Responda apenas o JSON pedido, em português.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) return auth.error;
    const { supabase, userId } = auth;

    const body = await req.json().catch(() => null);
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    if (!taskId) return json({ error: "Proposta não informada." }, 400);

    const [taskRes, filesRes, testsRes] = await Promise.all([
      supabase
        .from("dev_tasks")
        .select("id, title, problem, solution, state, risk_level, source, applied_at")
        .eq("id", taskId)
        .eq("source", "evolution")
        .maybeSingle(),
      supabase
        .from("dev_task_files")
        .select("path, change_type, reason, language, patch")
        .eq("task_id", taskId)
        .order("path"),
      supabase
        .from("evolution_test_runs")
        .select("name, required, result, output")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
    ]);

    if (taskRes.error || !taskRes.data) return json({ error: "Proposta não encontrada." }, 404);
    const task = taskRes.data;
    const files = filesRes.data ?? [];
    const tests = testsRes.data ?? [];

    if (task.applied_at) {
      return json({ error: "Esta proposta já foi aplicada — crie uma nova proposta." }, 400);
    }
    if (files.length === 0) {
      return json({ error: "Esta proposta não tem patches para corrigir." }, 400);
    }

    const failures = tests.filter((t) => t.result === "failed");
    if (failures.length === 0) {
      return json({ error: "Nenhum teste falhou — não há nada para corrigir." }, 400);
    }

    const filesBlock = files
      .map((f) => {
        const patch = typeof f.patch === "string" ? f.patch.slice(0, 6000) : "(sem patch)";
        return `### ${f.path} (${f.change_type})\n${f.reason ?? ""}\n\`\`\`diff\n${patch}\n\`\`\``;
      })
      .join("\n\n")
      .slice(0, 16000);

    const failuresBlock = failures
      .map((f) => `- ${f.name}${f.required ? " (obrigatório)" : ""}: ${f.output ?? "sem detalhes"}`)
      .join("\n")
      .slice(0, 6000);

    let output: z.infer<typeof FixSchema>;
    try {
      const result = await generateWithFallback({ structuredOutputs: true }, (model) =>
        generateText({
          model,
          output: Output.object({ schema: FixSchema }),
          temperature: 0.2,
          system: SYSTEM_PROMPT,
          prompt: `Proposta: ${task.title}\n\nProblema: ${task.problem ?? "-"}\n\nSolução planejada: ${task.solution ?? "-"}\n\nTestes que FALHARAM:\n${failuresBlock}\n\nPatches atuais:\n\n${filesBlock}`,
        }),
      );
      output = FixSchema.parse(result.output);
    } catch (err) {
      console.error("evolution-fix IA erro:", (err as Error)?.message);
      const { message, status } = describeAiError(err);
      return json({ error: message }, status);
    }

    const cleaned = output.files.filter((f) => f.path && f.patch);
    if (cleaned.length === 0) {
      return json({ error: "A IA não devolveu patches corrigidos. Tente novamente." }, 502);
    }

    const blocked = cleaned.filter((f) => isForbiddenPath(f.path)).map((f) => f.path);
    if (blocked.length > 0) {
      return json(
        {
          error: `A correção tentou alterar arquivos protegidos (${blocked.join(", ")}). Correção descartada.`,
        },
        400,
      );
    }

    // Insert the corrected patches FIRST, then drop the old ones — never delete
    // before the new set is safely stored (otherwise a failed insert wipes the proposal).
    const changeTypeMap: Record<string, string> = {
      create: "created",
      modify: "modified",
      delete: "deleted",
      created: "created",
      modified: "modified",
      deleted: "deleted",
    };

    const oldIds = (
      await supabase.from("dev_task_files").select("id").eq("task_id", taskId)
    ).data?.map((r) => r.id as string) ?? [];

    const { error: insertError } = await supabase.from("dev_task_files").insert(
      cleaned.map((f) => ({
        task_id: taskId,
        user_id: userId,
        path: f.path.slice(0, 400),
        change_type: changeTypeMap[f.change_type] ?? "modified",
        reason: f.reason?.slice(0, 1000) ?? null,
        language: f.language?.slice(0, 40) ?? null,
        patch: f.patch,
      })),
    );
    if (insertError) {
      console.error("evolution-fix insert falhou:", insertError.message);
      return json({ error: `Não foi possível salvar os patches corrigidos: ${insertError.message}` }, 500);
    }

    if (oldIds.length > 0) {
      await supabase.from("dev_task_files").delete().in("id", oldIds);
    }

    await supabase.from("evolution_test_runs").delete().eq("task_id", taskId);

    await supabase.from("dev_task_events").insert({
      task_id: taskId,
      user_id: userId,
      action: "ai_autofix",
      detail: {
        summary: output.summary,
        notes: output.notes,
        approach_changed: output.approach_changed,
        failures: failures.map((f) => f.name),
        files: cleaned.map((f) => f.path),
      },
      simulated: true,
    });

    return json({
      ok: true,
      summary: output.summary,
      notes: output.notes,
      approach_changed: output.approach_changed,
      files: cleaned.length,
      fixed: failures.length,
    });
  } catch (err) {
    console.error("evolution-fix erro:", (err as Error)?.message);
    return json({ error: "Erro inesperado." }, 500);
  }
});
