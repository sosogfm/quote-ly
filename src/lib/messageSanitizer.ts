/**
 * Filtra propriedades não suportadas de objetos de mensagem antes de serem
 * enviados ou armazenados. Atualmente remove apenas "reasoning_content",
 * mas pode ser estendido para outros campos inesperados.
 */

export interface ChatMessage {
  role: 'assistant' | 'user' | 'system';
  content: string;
  // outras propriedades permitidas podem ser adicionadas aqui
  [key: string]: any;
}

/**
 * Remove campos não reconhecidos do objeto de mensagem.
 *
 * @param message Mensagem a ser sanitizada.
 * @returns Nova mensagem sem propriedades proibidas.
 */
export function sanitizeMessage(message: ChatMessage): ChatMessage {
  const { reasoning_content, ...allowed } = message;
  return allowed as ChatMessage;
}

/**
 * Aplica a sanitização a um array completo de mensagens.
 */
export function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(sanitizeMessage);
}
