import { z } from "zod";

const userMessageSchema = z.object({
  role: z.literal("user"),
  content: z.string(),
});

const assistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.string(),
});

const systemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

export const chatMessageSchema = z.union([
  userMessageSchema,
  assistantMessageSchema,
  systemMessageSchema,
]);

export type ChatMessage = z.infer<typeof chatMessageSchema>;
