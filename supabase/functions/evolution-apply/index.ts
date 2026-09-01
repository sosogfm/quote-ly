// Applies an approved evolution proposal to the code repository by opening a Pull Request.
import { streamText } from "npm:ai@7";
import {
  corsHeaders,
  json,
  requireAdmin,
  canApply,
  isForbiddenPath,
  type ProposalState,
} from "../_shared/evolution.ts";
import { generateWithFallback, describeAiError } from "../_shared/ai-provider.ts";
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

/**
 * Resolves the final content of EVERY file that needs AI in a SINGLE model call.
 * Files that already have `new_content` are returned as-is without touching the model.
 * This collapses N per-file calls into 1, which is what was triggering Groq rate
 * limits (429) when opening a PR with multiple files.
 */
async function resolveAllContents(
  files: FileRow[],
  currentContents: Map<string, string | null>,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();

  // Pass through files that already have final content.
  const needAi: FileRow[] = [];
  for (const file of files) {
    if (file.change_type === "deleted") continue;
    if (file.new_content && file.new_content.trim().length > 0) {
      resolved.set(file.path, normalizeContent(file.new_content));
    } else if (!file.patch || file.patch.trim().length === 0) {
      throw new Error(`Sem conteúdo nem patch para ${file.path}.`);
    } else {
      needAi.push(file);
    }
  }

  if (needAi.length === 0) return resolved;

  // Build a single prompt describing every file that still needs resolving.
  const fileBlocks = needAi
    .map((file, i) => {
      const cur = currentContents.get(file.path) ?? null;
      return [
        `### FILE_${i + 1}: ${file.path}`,
        `change_type: ${file.change_type}`,
        file.reason ? `objective: ${file.reason}` : "",
        cur === null
          ? "current: (file does not exist yet — generate from scratch)"
          : `current:\n<<<CURRENT\n${cur}\nCURRENT>>>`,
        `patch:\n<<<PATCH\n${file.patch}\nPATCH>>>`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const fileList = needAi.map((f, i) => `FILE_${i + 1}: ${f.path}`).join("\n");

  // Use streaming consumed server-side so long generations (many files) keep the
  // connection alive instead of being severed after ~2min of silence.
  const { text } = await generateWithFallback({}, (model) =>
    streamText({
      model,
      system:
        "Você aplica patches em arquivos de código. Responda APENAS com um único objeto JSON válido " +
        "mapeando cada caminho de arquivo ao seu conteúdo final completo. " +
        'Formato EXATO: { "<caminho>": "<conteúdo completo do arquivo>", ... }. ' +
        "Sem cercas de markdown, sem explicações, sem comentários extras. Preserve o estilo do projeto. " +
        "Cada valor deve ser o conteúdo final COMPLETO do arquivo (não um diff).",
      prompt: [
        `Resolva os patches abaixo e devolva o conteúdo final de cada arquivo como JSON.`,
        `Arquivos a resolver:\n${fileList}`,
        `Dados:\n${fileBlocks}`,
        `Devolva um JSON objeto com EXATAMENTE estas chaves: ${needAi.map((f) => `"${f.path}"`).join(", ")}.`,
      ].join("\n\n"),
    }).then((r) => r.text),
  );

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("A IA não devolveu um JSON válido com o conteúdo dos arquivos.");
  }

  for (const file of needAi) {
    const content = parsed[file.path];
    if (!content || !content.trim()) {
      throw new Error(`A IA não gerou conteúdo para ${file.path}.`);
    }
    resolved.set(file.path, normalizeContent(content));
  }

  return resolved;
}

function normalizeContent(content: string): string {
  let out = content.trim();
  const fence = out.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  if (fence) out = fence[1];
  return `${out}\n`.replace(/\n+$/, "\n");
}

function stripCodeFence(text: string): string {
  let out = text.trim();
  const fence = out.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  if (fence) out = fence[1];
  // If the model wrapped the whole object but left trailing prose, cut at the
  // first balanced object. Take the substring from first { to last }.
  const start = out.indexOf("{");
  const end = out.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) out = out.slice(start, end + 1);
  return out;
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
    const confirmCritical = body?.confirmCritical === true;
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
      criticalOverride: confirmCritical,
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
    const criticalAllowed =
      task.risk_level === "critical" && confirmCritical && settings.max_auto_risk === "critical";
    if (taskIdx > maxIdx && !criticalAllowed) {
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

    // 3. Fetch current contents for every non-deleted file in one pass.
    const currentContents = new Map<string, string | null>();
    const existingShas = new Map<string, string>();
    for (const file of list) {
      if (file.change_type === "deleted") continue;
      const path = file.path.replace(/^\.?\//, "");
      try {
        const res = await gh<{ sha: string; content: string; encoding: string }>(
          `repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
        );
        currentContents.set(path, res.encoding === "base64" ? b64decode(res.content) : res.content);
        existingShas.set(path, res.sha);
      } catch (err) {
        if (!(err instanceof GithubError) || err.status !== 404) throw err;
        currentContents.set(path, null);
      }
    }

    // 4. Resolve ALL file contents in a SINGLE AI call (was: one call per file).
    let resolved: Map<string, string>;
    try {
      resolved = await resolveAllContents(list, currentContents);
    } catch (err) {
      const ai = describeAiError(err);
      console.error("evolution-apply resolve erro:", (err as Error)?.message);
      return json({ error: ai.message || "Erro ao gerar o conteúdo dos arquivos." }, ai.status || 500);
    }

    // 5. Commit each file (deletes handled inline).
    const changed: string[] = [];
    for (const file of list) {
      const path = file.path.replace(/^\.?\//, "");

      if (file.change_type === "deleted") {
        const sha = existingShas.get(path);
        if (!sha) continue;
        await gh(`repos/${owner}/${repo}/contents/${encodeURI(path)}`, {
          method: "DELETE",
          body: {
            message: `chore(evolution): remove ${path}`,
            sha,
            branch,
          },
        });
        changed.push(path);
        continue;
      }

      const content = resolved.get(path);
      if (!content) {
        throw new Error(`Conteúdo não resolvido para ${path}.`);
      }
      await gh(`repos/${owner}/${repo}/contents/${encodeURI(path)}`, {
        method: "PUT",
        body: {
          message: `feat(evolution): ${file.reason?.slice(0, 60) || path}`,
          content: b64encode(content),
          branch,
          ...(existingShas.has(path) ? { sha: existingShas.get(path) } : {}),
        },
      });
      changed.push(path);

      // Persist resolved content so a re-apply never calls the model again.
      await supabase
        .from("dev_task_files")
        .update({ new_content: content })
        .eq("id", file.id);
    }

    if (changed.length === 0) {
      return json({ error: "Nenhuma alteração pôde ser aplicada." }, 400);
    }

    // 6. Pull Request
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
