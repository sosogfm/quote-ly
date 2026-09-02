import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  WorkspaceSidebar,
  type ProjectSummary,
  type ThreadSummary,
} from "@/components/workspace/WorkspaceSidebar";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AiProviderSelect } from "@/components/AiProviderSelect";
import { ArtifactsPanel } from "@/components/workspace/ArtifactsPanel";
import { extractFileText, isImage } from "@/lib/fileExtract";
import type { ArtifactLike } from "@/lib/artifactDownload";
import { Button } from "@/components/ui/button";
import { Paperclip, PanelRight, Sparkles, X } from "lucide-react";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const AI_STATUS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-status`;


function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function textOf(message: UIMessage) {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
}

export default function Workspace() {
  const { threadId } = useParams<{ threadId?: string }>();
  const navigate = useNavigate();
  const { user, session } = useAuth();

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [aiLabel, setAiLabel] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactLike[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const threadIdRef = useRef<string | null>(threadId ?? null);
  const savedIds = useRef<Set<string>>(new Set());
  // Thread we just created client-side: its messages live in memory already,
  // so the route change must not trigger a (re)load that would wipe them.
  const skipLoadRef = useRef<string | null>(null);
  // Raw File objects picked in the composer (mirrored by attachedNames for UI).
  const pendingFiles = useRef<File[]>([]);
  const [attachedNames, setAttachedNames] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The URL is the single source of truth for which conversation is open.
  // A thread only exists after "Nova conversa" creates one, so sending a
  // message can never spawn a conversation on its own.
  if (threadIdRef.current !== (threadId ?? null)) {
    threadIdRef.current = threadId ?? null;
  }



  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: CHAT_URL,
      body: () => ({ threadId: threadIdRef.current }),
      headers: () => ({
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      }),
    }),
  });

  const loadSidebar = useCallback(async () => {
    if (!user) return;
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase
        .from("threads")
        .select("id, title, updated_at, project_id")
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase.from("projects").select("id, name, color").order("created_at"),
    ]);
    setThreads((t ?? []) as ThreadSummary[]);
    setProjects((p ?? []) as ProjectSummary[]);
  }, [user]);

  useEffect(() => {
    loadSidebar();
  }, [loadSidebar]);

  // Which AI provider is serving requests (own key vs. Lovable credits).
  useEffect(() => {
    fetch(AI_STATUS_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setAiLabel(d?.label ?? null);
        setAiModel(d?.model ?? null);
      })
      .catch(() => setAiLabel(null));
  }, []);

  // Files the assistant generated for this conversation
  const loadArtifacts = useCallback(async () => {
    if (!user || !threadId) {
      setArtifacts([]);
      return;
    }
    const { data } = await supabase
      .from("artifacts")
      .select("id, title, kind, language, content")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false });
    setArtifacts((data ?? []) as ArtifactLike[]);
  }, [user, threadId]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  // Load messages for the active thread
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Thread just created in this session — keep the in-memory messages.
      // The flag stays set (instead of being consumed) so a remount or a
      // double-invoked effect can't wipe the conversation and orphan it.
      if (threadId && skipLoadRef.current === threadId) {
        return;
      }

      savedIds.current = new Set();
      if (!threadId) {
        setMessages([]);
        setInitialMessages([]);
        return;
      }

      setLoadingThread(true);
      const { data } = await supabase
        .from("chat_messages")
        .select("id, role, parts, sdk_message_id")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (cancelled) return;
      const loaded: UIMessage[] = (data ?? []).map((row) => ({
        id: row.sdk_message_id ?? row.id,
        role: row.role as UIMessage["role"],
        parts: (row.parts ?? []) as UIMessage["parts"],
      }));
      loaded.forEach((m) => savedIds.current.add(m.id));
      setInitialMessages(loaded);
      setMessages(loaded);
      setLoadingThread(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [threadId, setMessages]);

  // Save one message, idempotently (unique on thread_id + sdk_message_id).
  const persistMessage = useCallback(
    async (tid: string, m: UIMessage) => {
      if (!user) return;
      savedIds.current.add(m.id);
      const { error: upsertError } = await supabase.from("chat_messages").upsert(
        {
          thread_id: tid,
          user_id: user.id,
          role: m.role,
          parts: m.parts as unknown as never,
          text_content: textOf(m),
          sdk_message_id: m.id,
        },
        { onConflict: "thread_id,sdk_message_id" },
      );
      if (upsertError) savedIds.current.delete(m.id);
    },
    [user],
  );

  // Persist finished messages
  useEffect(() => {
    if (!user || status === "streaming" || status === "submitted") return;
    const tid = threadIdRef.current;
    if (!tid) return;
    const pending = messages.filter((m) => !savedIds.current.has(m.id));
    if (pending.length === 0) return;
    (async () => {
      for (const m of pending) await persistMessage(tid, m);
      await supabase
        .from("threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", tid);
      loadSidebar();
      loadArtifacts();
    })();
  }, [messages, status, user, loadSidebar, loadArtifacts, persistMessage]);


  // "Nova conversa" is the only thing that creates a thread. It gets its own
  // URL immediately and every message afterwards stays in that URL.
  const startNewThread = useCallback(async () => {
    if (!user) return;
    const { data, error: insertError } = await supabase
      .from("threads")
      .insert({ user_id: user.id, title: "Nova conversa" })
      .select("id")
      .single();
    if (insertError || !data) {
      toast.error("Não foi possível criar a conversa.");
      return;
    }
    skipLoadRef.current = data.id;
    threadIdRef.current = data.id;
    setMessages([]);
    navigate(`/workspace/${data.id}`);
    loadSidebar();
  }, [user, navigate, setMessages, loadSidebar]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    const attached = pendingFiles.current;
    if ((!text && attached.length === 0) || !user) return;

    const tid = threadIdRef.current;
    if (!tid) {
      toast.error('Clique em "Nova conversa" para começar.');
      return;
    }


    // Images go to the model as image parts; documents are extracted to text
    // on the client so text-only providers can read them too.
    const images = attached.filter(isImage);
    const docs = attached.filter((f) => !isImage(f));
    let prompt = text ?? "";
    if (docs.length > 0) {
      setExtracting(true);
      try {
        const blocks = await Promise.all(docs.map((f) => extractFileText(f)));
        prompt = `${prompt}\n\n${blocks.join("\n\n")}`.trim();
      } finally {
        setExtracting(false);
      }
    }

    const imageParts: FileUIPart[] = await Promise.all(
      images.map(async (f) => ({
        type: "file" as const,
        mediaType: f.type,
        filename: f.name,
        url: await fileToDataUrl(f),
      })),
    );

    pendingFiles.current = [];
    setAttachedNames([]);

    // Own the message id so the user's turn can be stored right away — if the
    // answer fails or the tab closes, the question is not lost. The upsert is
    // idempotent, so the persist effect can't duplicate it later.
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        ...(prompt ? [{ type: "text" as const, text: prompt }] : []),
        ...imageParts,
      ],
    };
    void persistMessage(tid, userMessage);
    sendMessage(userMessage);

    // Give the still-unnamed thread a title from its first message.
    const current = threads.find((t) => t.id === tid);
    if (prompt && (!current || current.title === "Nova conversa")) {
      const title = prompt.slice(0, 60);
      setThreads((prev) => prev.map((t) => (t.id === tid ? { ...t, title } : t)));
      await supabase.from("threads").update({ title }).eq("id", tid);
      loadSidebar();
    }
  };



  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next = [...pendingFiles.current, ...Array.from(list)].slice(0, 8);
    pendingFiles.current = next;
    setAttachedNames(next.map((f) => f.name));
  };

  const removeFile = (index: number) => {
    const next = pendingFiles.current.filter((_, i) => i !== index);
    pendingFiles.current = next;
    setAttachedNames(next.map((f) => f.name));
  };

  useEffect(() => {
    if (error) toast.error(error.message || "Something went wrong.");
  }, [error]);

  const handleRenameThread = async (id: string, title: string) => {
    setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    const { error: updateError } = await supabase
      .from("threads")
      .update({ title })
      .eq("id", id);
    if (updateError) {
      toast.error("Não foi possível renomear a conversa.");
      loadSidebar();
    }
  };

  const handleDeleteThread = async (id: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== id));
    const { error: deleteError } = await supabase.from("threads").delete().eq("id", id);
    if (deleteError) {
      toast.error("Não foi possível excluir a conversa.");
      loadSidebar();
      return;
    }
    toast.success("Conversa excluída.");
    if (threadIdRef.current === id) {
      threadIdRef.current = null;
      setMessages([]);
      navigate("/workspace");
    }
    loadSidebar();
  };



  const busy = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <WorkspaceSidebar
        threads={threads}
        projects={projects}
        activeThreadId={threadId ?? null}
        onNewChat={() => {
          threadIdRef.current = null;
          navigate("/workspace");
        }}
        onSelectThread={(id) => navigate(`/workspace/${id}`)}
        onRenameThread={handleRenameThread}
        onDeleteThread={handleDeleteThread}
        

      />


      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2">
          {aiLabel && (
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
              IA: {aiLabel}
              {aiModel ? ` · ${aiModel}` : ""}
            </span>
          )}
          <AiProviderSelect />
          <Button
            variant={panelOpen ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <PanelRight className="h-4 w-4" />
            Arquivos
            {artifacts.length > 0 ? ` (${artifacts.length})` : ""}
          </Button>
        </div>

        <Conversation className="flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl">
            {messages.length === 0 && !loadingThread ? (
              <ConversationEmptyState
                icon={<Sparkles className="h-6 w-6" />}
                title="O que vamos construir hoje?"
                description="Peça um documento, um PDF, um plano ou código. Envie imagens e arquivos para análise."
              />
            ) : (
              messages.map((m) => (
                <Message from={m.role} key={m.id}>
                  <MessageContent>
                    {m.parts.map((part, i) => {
                      if (part.type === "text") {
                        return (
                          <MessageResponse key={`${m.id}-${i}`}>
                            {part.text}
                          </MessageResponse>
                        );
                      }
                      if (
                        part.type === "file" &&
                        (part.mediaType ?? "").startsWith("image/")
                      ) {
                        return (
                          <img
                            key={`${m.id}-${i}`}
                            src={part.url}
                            alt={part.filename ?? "Imagem enviada"}
                            className="max-h-64 rounded-md border border-border"
                          />
                        );
                      }
                      if (part.type === "reasoning" && part.text) {
                        return (
                          <p
                            className="text-xs italic text-muted-foreground"
                            key={`${m.id}-${i}`}
                          >
                            {part.text}
                          </p>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
              ))
            )}
            {status === "submitted" && <Shimmer>Pensando…</Shimmer>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mx-auto w-full max-w-3xl px-4 pb-6">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              {attachedNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {attachedNames.map((name, i) => (
                    <span
                      key={`${name}-${i}`}
                      className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs"
                    >
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-40 truncate">{name}</span>
                      <button
                        type="button"
                        aria-label={`Remover ${name}`}
                        onClick={() => removeFile(i)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <PromptInputTextarea
                placeholder={
                  extracting ? "Lendo arquivos…" : "Escreva para o seu workspace…"
                }
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.txt,.md,.csv,.json,.yml,.yaml,.html,.css,.sql,.ts,.tsx,.js,.jsx,.py"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <PromptInputButton
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Anexar arquivos"
                >
                  <Paperclip className="h-4 w-4" />
                </PromptInputButton>
              </PromptInputTools>
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </main>

      {panelOpen && (
        <ArtifactsPanel artifacts={artifacts} onClose={() => setPanelOpen(false)} />
      )}
    </div>
  );
}
