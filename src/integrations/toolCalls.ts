import { callTool } from "./api";

/**
 * Garante que o conteúdo enviado ao tool 'remember' não ultrapasse o limite
 * máximo de 500 caracteres. Se exceder, o texto é truncado e três pontos
 * são adicionados para indicar a perda de parte do conteúdo.
 */
export function safeRememberContent(content: string): string {
  const MAX_LENGTH = 500;
  if (content.length <= MAX_LENGTH) return content;
  return content.slice(0, MAX_LENGTH - 3) + "...";
}

/**
 * Executa a ferramenta 'remember' com o conteúdo já validado.
 *
 * @param params Objeto contendo ao menos a propriedade `content` e, opcionalmente,
 *               outros parâmetros aceitos pela ferramenta.
 * @returns Resposta da chamada da API.
 */
export async function callRememberTool(params: { content: string; [key: string]: any }) {
  // Garante que o conteúdo esteja dentro do limite aceito pela API.
  const content = safeRememberContent(params.content);

  // Se houver outros parâmetros além de `content`, eles são preservados.
  const { content: _, ...rest } = params;
  const payload = {
    tool: "remember",
    content,
    ...rest,
  };

  return await callTool(payload);
}
