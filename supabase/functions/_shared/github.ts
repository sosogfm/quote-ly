// Thin wrapper over the Lovable connector gateway for the GitHub REST API.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/github";

export class GithubError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`GitHub [${status}]: ${body.slice(0, 500)}`);
    this.status = status;
  }
}

export function githubConfigured(): boolean {
  return !!Deno.env.get("LOVABLE_API_KEY") && !!Deno.env.get("GITHUB_API_KEY");
}

export async function gh<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connectionKey = Deno.env.get("GITHUB_API_KEY");
  if (!lovableKey || !connectionKey) {
    throw new GithubError(500, "Conexão com o GitHub não configurada.");
  }

  const res = await fetch(`${GATEWAY_URL}/${path.replace(/^\//, "")}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`GitHub request failed [${res.status}] ${path}: ${text.slice(0, 800)}`);
    throw new GithubError(res.status, text);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export function b64encode(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

export function b64decode(data: string): string {
  const clean = data.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
