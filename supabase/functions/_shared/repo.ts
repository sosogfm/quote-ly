// Read-only access to the project's own source code (same GitHub repo the
// Central de Evolução uses). Used by the chat assistant so it can answer
// questions about, and reason over, its own codebase.
import { gh, githubConfigured, b64decode } from "./github.ts";
import { isForbiddenPath } from "./evolution.ts";

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

let repoCache: { at: number; value: RepoRef | null } | null = null;

/** Loads the configured repo (cached 60s) via the service role REST endpoint. */
export async function loadRepoRef(): Promise<RepoRef | null> {
  if (repoCache && Date.now() - repoCache.at < 60_000) return repoCache.value;
  let value: RepoRef | null = null;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const res = await fetch(
        `${url}/rest/v1/evolution_repo_settings?select=repo_owner,repo_name,base_branch&order=created_at.asc&limit=1`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      if (res.ok) {
        const rows = await res.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row?.repo_owner && row?.repo_name) {
          value = {
            owner: row.repo_owner,
            repo: row.repo_name,
            branch: row.base_branch || "main",
          };
        }
      }
    }
  } catch {
    value = null;
  }
  repoCache = { at: Date.now(), value };
  return value;
}

export function repoAvailable(): boolean {
  return githubConfigured();
}

let treeCache: { at: number; ref: string; paths: string[] } | null = null;

/** All file paths in the repo (cached 60s), forbidden paths removed. */
export async function listRepoFiles(ref: RepoRef): Promise<string[]> {
  const key = `${ref.owner}/${ref.repo}@${ref.branch}`;
  if (treeCache && treeCache.ref === key && Date.now() - treeCache.at < 60_000) {
    return treeCache.paths;
  }
  const tree = await gh<{ tree: { path: string; type: string }[] }>(
    `repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(ref.branch)}?recursive=1`,
  );
  const paths = (tree.tree ?? [])
    .filter((n) => n.type === "blob" && !isForbiddenPath(n.path))
    .map((n) => n.path);
  treeCache = { at: Date.now(), ref: key, paths };
  return paths;
}

const MAX_FILE_CHARS = 20000;

/** Reads one file's text content. Throws for forbidden or binary paths. */
export async function readRepoFile(
  ref: RepoRef,
  path: string,
): Promise<{ path: string; content: string; truncated: boolean }> {
  const clean = path.trim().replace(/^\.?\//, "");
  if (isForbiddenPath(clean)) {
    throw new Error(`Arquivo protegido, leitura não permitida: ${clean}`);
  }
  const file = await gh<{ content?: string; encoding?: string; size?: number }>(
    `repos/${ref.owner}/${ref.repo}/contents/${clean.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref.branch)}`,
  );
  if (!file?.content) throw new Error(`Não foi possível ler ${clean}.`);
  const text = b64decode(file.content);
  const truncated = text.length > MAX_FILE_CHARS;
  return { path: clean, content: truncated ? text.slice(0, MAX_FILE_CHARS) : text, truncated };
}

/** Naive grep across a bounded set of candidate files. */
export async function searchRepo(
  ref: RepoRef,
  query: string,
  opts: { pathGlob?: string; maxFiles?: number } = {},
): Promise<{ path: string; line: number; text: string }[]> {
  const all = await listRepoFiles(ref);
  const globRe = opts.pathGlob
    ? new RegExp(
        opts.pathGlob
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, "§")
          .replace(/\*/g, "[^/]*")
          .replace(/§/g, ".*"),
      )
    : null;
  const textExt = /\.(ts|tsx|js|jsx|json|md|css|sql|html|yml|yaml|toml|txt)$/i;
  const candidates = all
    .filter((p) => textExt.test(p) && (!globRe || globRe.test(p)))
    .slice(0, opts.maxFiles ?? 120);

  const needle = query.toLowerCase();
  const hits: { path: string; line: number; text: string }[] = [];
  for (const path of candidates) {
    if (hits.length >= 40) break;
    try {
      const { content } = await readRepoFile(ref, path);
      content.split("\n").forEach((line, i) => {
        if (hits.length < 40 && line.toLowerCase().includes(needle)) {
          hits.push({ path, line: i + 1, text: line.trim().slice(0, 200) });
        }
      });
    } catch {
      // unreadable file — skip
    }
  }
  return hits;
}
