import type { ChatMessage } from './types';
import { sendToAPI } from './api';
import { sanitizeMessages } from './messageSanitizer';

/**
 * Submits a chat conversation to the backend after sanitizing messages.
 *
 * @param messages - Array of chat messages to be sent.
 * @returns The response from the API.
 */
export async function submitChat(messages: ChatMessage[]) {
  const safeMessages = sanitizeMessages(messages);
  return await sendToAPI(safeMessages);
}
