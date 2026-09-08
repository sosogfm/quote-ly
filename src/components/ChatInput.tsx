import React, { useState } from "react";
import { callAssistant } from "../services/assistant";
import type { ChatMessage } from "../integrations/supabase/types";

interface ChatInputProps {
  messages: ChatMessage[];
  onReply: (reply: string) => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ messages, onReply }) => {
  const [input, setInput] = useState("");

  const handleSubmit = async () => {
    try {
      const reply = await callAssistant(messages);
      // ... (processar reply como antes)
      onReply(reply);
    } catch (err) {
      console.error("Falha ao obter resposta do assistente", err);
      // opcional: exibir mensagem ao usuário
    }
  };

  return (
    <div className="chat-input">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Digite sua mensagem..."
      />
      <button onClick={handleSubmit} disabled={!input.trim()}>
        Enviar
      </button>
    </div>
  );
};

export default ChatInput;
