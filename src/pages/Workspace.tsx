import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
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
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AiProviderSelect } from "@/components/AiProviderSelect";
import { Sparkles } from "lucide-react";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const AI_STATUS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-status`;


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
  const threadIdRef = useRef<string | null>(threadId ?? null);
  const savedIds = useRef<Set<string>>(new Set());
  // Thread we just created client-side: its messages live in memory already,
  // so the route change must not trigger a (re)load that would wipe them.
  const skipLoadRef = useRef<string | null>(null);

  // Only adopt the route param when it names a thread; when the URL is
  // /workspace (no param) keep the thread created during this session,
  // otherwise every message would start a brand new conversation.
  if (threadId && threadIdRef.current !== threadId) {
    threadIdRef.current = threadId;
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
      .then((d) => setAiLabel(d?.label ?? null))
      .catch(() => setAiLabel(null));
  }, []);

  // Load messages for the active thread
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Thread just created in this session — keep the in-memory messages.
      if (threadId && skipLoadRef.current === threadId) {
        skipLoadRef.current = null;
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
        .order("created_at", { ascending: true });
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

  // Persist finished messages
  useEffect(() => {
    if (!user || status === "streaming" || status === "submitted") return;
    const tid = threadIdRef.current;
    if (!tid) return;
    const pending = messages.filter((m) => !savedIds.current.has(m.id));
    if (pending.length === 0) return;
    pending.forEach((m) => savedIds.current.add(m.id));
    (async () => {
      await supabase.from("chat_messages").insert(
        pending.map((m) => ({
          thread_id: tid,
          user_id: user.id,
          role: m.role,
          parts: m.parts as unknown as never,
          text_content: textOf(m),
          sdk_message_id: m.id,
        })),
      );
      await supabase
        .from("threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", tid);
      loadSidebar();
    })();
  }, [messages, status, user, loadSidebar]);

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    if (!text || !user) return;

    let tid = threadIdRef.current;
    if (!tid) {
      const { data, error: insertError } = await supabase
        .from("threads")
        .insert({
          user_id: user.id,
          title: text.slice(0, 60),
        })
        .select("id")
        .single();
      if (insertError || !data) {
        toast.error("Could not start a new chat.");
        return;
      }
      tid = data.id;
      threadIdRef.current = tid;
      skipLoadRef.current = tid;
      navigate(`/workspace/${tid}`, { replace: true });
      loadSidebar();

    }

    sendMessage({ text });
  };

  useEffect(() => {
    if (error) toast.error(error.message || "Something went wrong.");
  }, [error]);

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
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-2">
          {aiLabel && (
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
              IA: {aiLabel}
            </span>
          )}
          <AiProviderSelect />
        </div>

        <Conversation className="flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl">
            {messages.length === 0 && !loadingThread ? (
              <ConversationEmptyState
                icon={<Sparkles className="h-6 w-6" />}
                title="What are we building today?"
                description="Ask for a document, a plan, or working code."
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
            {status === "submitted" && <Shimmer>Thinking…</Shimmer>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="mx-auto w-full max-w-3xl px-4 pb-6">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea placeholder="Message your workspace…" />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools />
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </main>
    </div>
  );
}
