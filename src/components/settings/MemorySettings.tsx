import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Brain, Plus, Trash2, Pencil } from "lucide-react";

type MemoryKind = "preference" | "style" | "fact" | "correction" | "skill";

interface MemoryRow {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  active: boolean;
  created_at: string;
}

interface ProfileSummary {
  user_id: string;
  summary: string;
  writing_style: string | null;
  message_count: number;
}

const KIND_LABELS: Record<MemoryKind, string> = {
  preference: "Preference",
  style: "Style",
  fact: "Fact",
  correction: "Correction",
  skill: "Skill",
};

const KIND_COLORS: Record<MemoryKind, string> = {
  preference: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  style: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  fact: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  correction: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  skill: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

export function MemorySettings() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // new memory form
  const [newContent, setNewContent] = useState("");
  const [newKind, setNewKind] = useState<MemoryKind>("preference");
  const [newImportance, setNewImportance] = useState("5");
  const [saving, setSaving] = useState(false);

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // summary edit
  const [editSummary, setEditSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [styleDraft, setStyleDraft] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [memRes, sumRes] = await Promise.all([
      supabase
        .from("user_memories")
        .select("id, kind, content, importance, active, created_at")
        .eq("user_id", user.id)
        .order("importance", { ascending: false }),
      supabase
        .from("user_profile_summary")
        .select("user_id, summary, writing_style, message_count")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    setMemories((memRes.data ?? []) as MemoryRow[]);
    setSummary((sumRes.data as ProfileSummary) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const addMemory = async () => {
    if (!user || !newContent.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("user_memories").insert({
      user_id: user.id,
      content: newContent.trim(),
      kind: newKind,
      importance: Number(newImportance) || 5,
      active: true,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Memory saved");
    setNewContent("");
    setNewImportance("5");
    load();
  };

  const deleteMemory = async (id: string) => {
    const { error } = await supabase.from("user_memories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMemories((prev) => prev.filter((m) => m.id !== id));
    toast.success("Memory deleted");
  };

  const toggleActive = async (m: MemoryRow) => {
    const { error } = await supabase
      .from("user_memories")
      .update({ active: !m.active })
      .eq("id", m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMemories((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, active: !x.active } : x)),
    );
  };

  const startEdit = (m: MemoryRow) => {
    setEditingId(m.id);
    setEditContent(m.content);
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    const { error } = await supabase
      .from("user_memories")
      .update({ content: editContent.trim() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMemories((prev) =>
      prev.map((x) => (x.id === id ? { ...x, content: editContent.trim() } : x)),
    );
    setEditingId(null);
    toast.success("Memory updated");
  };

  const saveSummary = async () => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      summary: summaryDraft,
      writing_style: styleDraft || null,
      message_count: summary?.message_count ?? 0,
    };
    const { error } = await supabase
      .from("user_profile_summary")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSummary({
      user_id: user.id,
      summary: summaryDraft,
      writing_style: styleDraft || null,
      message_count: summary?.message_count ?? 0,
    });
    setEditSummary(false);
    toast.success("Profile summary updated");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Account Memory</CardTitle>
              <CardDescription>
                What the assistant remembers about you across every conversation.
                It uses these to tailor its replies.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : summary ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Profile summary</Label>
                {editSummary ? (
                  <div className="mt-1 space-y-3">
                    <textarea
                      className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                    />
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Writing style</Label>
                      <Input
                        value={styleDraft}
                        onChange={(e) => setStyleDraft(e.target.value)}
                        placeholder="e.g. concise, direct, no emojis"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveSummary}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditSummary(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm whitespace-pre-wrap">{summary.summary}</p>
                )}
              </div>
              {summary.writing_style && !editSummary && (
                <div>
                  <Label className="text-xs text-muted-foreground">Writing style</Label>
                  <p className="mt-1 text-sm">{summary.writing_style}</p>
                </div>
              )}
              {!editSummary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSummaryDraft(summary.summary);
                    setStyleDraft(summary.writing_style ?? "");
                    setEditSummary(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit summary
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Built from {summary.message_count} messages. The assistant refreshes this
                automatically as you talk; you can also edit it manually.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No profile summary yet — it builds up as you chat. You can seed one now.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSummaryDraft("");
                  setStyleDraft("");
                  setEditSummary(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Create summary
              </Button>
              {editSummary && (
                <div className="space-y-3">
                  <textarea
                    className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Describe yourself, your work, your context…"
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                  />
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Writing style</Label>
                    <Input
                      value={styleDraft}
                      onChange={(e) => setStyleDraft(e.target.value)}
                      placeholder="e.g. concise, direct, no emojis"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveSummary}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditSummary(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved memories</CardTitle>
          <CardDescription>
            Individual facts, preferences, corrections and skills. Add your own,
            or let the assistant save them during chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <Input
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="e.g. I prefer tabs over spaces, replies in English, no emojis"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addMemory();
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Select value={newKind} onValueChange={(v) => setNewKind(v as MemoryKind)}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABELS) as MemoryKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newImportance} onValueChange={setNewImportance}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addMemory} disabled={saving || !newContent.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </div>

          {memories.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No memories yet. They appear here as the assistant learns, or add one above.
            </p>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className={`flex items-start gap-3 rounded-lg border border-border p-3 ${
                    !m.active ? "opacity-50" : ""
                  }`}
                >
                  <Badge variant="outline" className={KIND_COLORS[m.kind]}>
                    {KIND_LABELS[m.kind]}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    {editingId === m.id ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full min-h-[60px] rounded-md border border-input bg-background px-2 py-1 text-sm"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(m.id)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm">{m.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Importance {m.importance} · {new Date(m.created_at).toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={m.active} onCheckedChange={() => toggleActive(m)} aria-label="Toggle active" />
                    {editingId !== m.id && (
                      <Button size="icon" variant="ghost" onClick={() => startEdit(m)} aria-label="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMemory(m.id)} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
