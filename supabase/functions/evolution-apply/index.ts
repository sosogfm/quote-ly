// Applies an approved evolution proposal to the code repository by opening a Pull Request.
import { generateText } from "npm:ai@7";
import {
  corsHeaders,
  json,
  requireAdmin,
  canApply,
  isForbiddenPath,
  type ProposalState,
} from "../_shared/evolution.ts";
import { getChatModel, describeAiError } from "../_shared/ai-provider.ts";
import { gh, githubConfigured, b64encode, b64decode, GithubError } from "../_shared/github.ts";

const RISK_ORDER = ["low", "medium", "high", "critical"] as const;

type FileRow = {
  id: string;
  path: string;
  change_type: string;
  patch: string | null;
  new_content: string | null;
  reason: string | null;
};

/** Produces the full new file content for a change, using the patch when needed. */
async function resolveContent(file: FileRow, currentContent: string | null): Promise<string> {
  if (file.new_content && file.new_content.trim().length > 0) return file.new_content;
  if (!file.patch || file.patch.trim().length === 0) {
    throw new Error(`Sem conteúdo nem patch para ${file.path}.`);
  }

  const { model } = getChatModel();
  const { text } = await generateText({
    model,
    system:
      "Você aplica patches em arquivos de código. Responda APENAS com o conteúdo final completo do arquivo, " +
      "sem cercas de markdown, sem comentários extras, sem explicações. Preserve o estilo do projeto.",
    prompt: [
      `Arquivo: ${file.path}`,
      `Tipo de mudança: ${file.change_type}`,
      file.reason ? `Objetivo: ${file.reason}` : "",
      currentContent === null
        ? "O arquivo ainda não existe no repositório. Gere-o do zero."
        : `Conteúdo atual:\n<<<ATUAL\n${currentContent}\nATUAL>>>`,
      `Mudança proposta (patch ou descrição):\n<<<PATCH\n${file.patch}\nPATCH>>>`,
      "Retorne o conteúdo final completo do arquivo.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  let out = text.trim();
  const fence = out.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  if (fence) out = fence[1];
  if (!out) throw new Error(`A IA não gerou conteúdo para ${file.path}.`);
  return `${out}\n`.replace(/\n+$/, "\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if ("error" in auth) return auth.error;
    const { supabase, userId } = auth;

    if (!githubConfigured()) {
      return json({ error: "Conexão com o GitHub não configurada no projeto." }, 400);
    }

    const body = await req.json().catch(() => null);
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    if (!taskId) return json({ error: "Proposta não informada." }, 400);

    const { data: task } = await supabase
      .from("dev_tasks")
      .select(
        "id, title, state, risk_level, requires_migration, migration_confirmed_at, plan_approved_at, problem, rollback_plan, github_pr_url, source",
      )
      .eq("id", taskId)
      .eq("source", "evolution")
      .maybeSingle();

    if (!task) return json({ error: "Proposta não encontrada." }, 404);
    if (task.github_pr_url) {
      return json({ error: "Esta proposta já tem um Pull Request aberto.", prUrl: task.github_pr_url }, 409);
    }

    const { data: runs } = await supabase
      .from("evolution_test_runs")
      .select("required, result")
      .eq("task_id", taskId);

    const gate = canApply({
      state: task.state as ProposalState,
      riskLevel: task.risk_level,
      approvedAt: task.plan_approved_at,
      requiresMigration: !!task.requires_migration,
      migrationConfirmedAt: task.migration_confirmed_at,
      tests: (runs ?? []).map((r) => ({ required: !!r.required, result: r.result as string })),
    });
    if (!gate.ok) return json({ error: gate.reasons.join(" "), reasons: gate.reasons }, 409);

    const { data: settings } = await supabase
      .from("evolution_repo_settings")
      .select("repo_owner, repo_name, base_branch, auto_apply_enabled, max_auto_risk")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings) return json({ error: "Configure o repositório do GitHub primeiro." }, 400);
    if (!settings.auto_apply_enabled) {
      return json({ error: "Aplicação automática está desativada nas configurações." }, 400);
    }

    const maxIdx = RISK_ORDER.indexOf((settings.max_auto_risk ?? "medium") as typeof RISK_ORDER[number]);
    const taskIdx = RISK_ORDER.indexOf((task.risk_level ?? "medium") as typeof RISK_ORDER[number]);
    if (taskIdx > maxIdx) {
      return json(
        { error: `Risco "${task.risk_level}" acima do limite permitido ("${settings.max_auto_risk}").` },
        409,
      );
    }

    const { data: files } = await supabase
      .from("dev_task_files")
      .select("id, path, change_type, patch, new_content, reason")
      .eq("task_id", taskId);

    const list = (files ?? []) as FileRow[];
    if (list.length === 0) return json({ error: "A proposta não tem arquivos afetados." }, 400);

    const blocked = list.filter((f) => isForbiddenPath(f.path));
    if (blocked.length > 0) {
      return json(
        { error: `Arquivos protegidos não podem ser alterados: ${blocked.map((f) => f.path).join(", ")}` },
        403,
      );
    }

    const owner = settings.repo_owner;
    const repo = settings.repo_name;
    const base = settings.base_branch || "main";

    // 1. Base commit SHA
    const ref = await gh<{ object: { sha: string } }>(`repos/${owner}/${repo}/git/ref/heads/${base}`);
    const baseSha = ref.object.sha;

    // 2. New branch
    const branch = `evolution/${taskId.slice(0, 8)}-${Date.now().toString(36)}`;
    await gh(`repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: baseSha },
    });

    // 3. Commit each file
    const changed: string[] = [];
    for (const file of list) {
      const path = file.path.replace(/^\.?\//, "");
      let existing: { sha: string; content: string } | null = null;
      try {
        const res = await gh<{ sha: string; content: string; encoding: string }>(
          `repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
        );
        existing = { sha: res.sha, content: res.encoding === "base64" ? b64decode(res.content) : res.content };
      } catch (err) {
        if (!(err instanceof GithubError) || err.status !== 404) throw err;
      }

      if (file.change_type === "deleted") {
        if (!existing) continue;
        await gh(`repos/${owner}/${repo}/contents/${encodeURI(path)}`, {
          method: "DELETE",
          body: {
            message: `chore(evolution): remove ${path}`,
            sha: existing.sha,
            branch,
          },
        });
        changed.push(path);
        continue;
      }

      const content = await resolveContent(file, existing?.content ?? null);
      await gh(`repos/${owner}/${repo}/contents/${encodeURI(path)}`, {
        method: "PUT",
        body: {
          message: `feat(evolution): ${file.reason?.slice(0, 60) || path}`,
          content: b64encode(content),
          branch,
          ...(existing ? { sha: existing.sha } : {}),
        },
      });
      changed.push(path);

      await supabase
        .from("dev_task_files")
        .update({ new_content: content })
        .eq("id", file.id);
    }

    if (changed.length === 0) {
      return json({ error: "Nenhuma alteração pôde ser aplicada." }, 400);
    }

    // 4. Pull Request
    const prBody = [
      `Proposta gerada pela Central de Evolução (risco: **${task.risk_level}**).`,
      task.problem ? `\n### Problema\n${task.problem}` : "",
      task.rollback_plan ? `\n### Plano de rollback\n${task.rollback_plan}` : "",
      `\n### Arquivos\n${changed.map((p) => `- \`${p}\``).join("\n")}`,
      `\nAprovada por humano em ${task.plan_approved_at}.`,
    ]
      .filter(Boolean)
      .join("\n");

    const pr = await gh<{ html_url: string; number: number }>(`repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: {
        title: `[Evolução] ${task.title}`.slice(0, 120),
        head: branch,
        base,
        body: prBody.slice(0, 60000),
        draft: false,
      },
    });

    await supabase
      .from("dev_tasks")
      .update({
        github_pr_url: pr.html_url,
        github_pr_number: pr.number,
        github_branch: branch,
        github_pr_opened_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    await supabase.from("dev_task_events").insert({
      task_id: taskId,
      user_id: userId,
      action: "github_pr_opened",
      detail: { prUrl: pr.html_url, prNumber: pr.number, branch, files: changed },
      simulated: false,
    });

    return json({ ok: true, prUrl: pr.html_url, prNumber: pr.number, branch, files: changed });
  } catch (err) {
    if (err instanceof GithubError) {
      return json({ error: `Falha no GitHub: ${err.message}` }, err.status === 404 ? 400 : err.status);
    }
    const ai = describeAiError(err);
    console.error("evolution-apply erro:", (err as Error)?.message);
    return json({ error: ai.message || "Erro inesperado ao aplicar a proposta." }, ai.status || 500);
  }
});
