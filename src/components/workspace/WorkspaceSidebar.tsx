import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Search,
  MessageSquare,
  FolderClosed,
  Settings as SettingsIcon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export type ThreadSummary = {
  id: string;
  title: string;
  updated_at: string;
  project_id: string | null;
};

export type ProjectSummary = {
  id: string;
  name: string;
  color: string | null;
};

type Props = {
  threads: ThreadSummary[];
  projects: ProjectSummary[];
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (id: string) => void;
};

export function WorkspaceSidebar({
  threads,
  projects,
  activeThreadId,
  onNewChat,
  onSelectThread,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const filtered = query.trim()
    ? threads.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
    : threads;

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-border bg-sidebar py-3">
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} aria-label="Expand sidebar">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNewChat} aria-label="New chat">
          <Plus className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Workspace
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 px-3 pb-3">
        <Button onClick={onNewChat} className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" /> New chat
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        {projects.length > 0 && (
          <div className="mb-4">
            <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Projects
            </p>
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80"
              >
                <FolderClosed className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{p.name}</span>
              </div>
            ))}
          </div>
        )}

        <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent
        </p>
        {filtered.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">No conversations yet.</p>
        ) : (
          <div className="space-y-0.5 pb-4">
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectThread(t.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  activeThreadId === t.id && "bg-accent font-medium",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-border p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" asChild>
          <Link to="/settings">
            <SettingsIcon className="h-4 w-4" /> Settings
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={async () => {
            await signOut();
            navigate("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
