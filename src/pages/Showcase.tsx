import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ExternalLink, Plus, Globe, Trash2, Loader2 } from "lucide-react";

type Site = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  created_at: string;
  sort_order: number;
};

function normalizeUrl(raw: string) {
  const v = raw.trim();
  if (!v) return v;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export default function Showcase() {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Site | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", url: "", description: "", image_url: "" });

  const load = async () => {
    const { data, error } = await supabase
      .from("showcase_sites")
      .select("id,title,description,url,image_url,created_at,sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível carregar os sites: " + error.message);
      return;
    }
    setSites((data ?? []) as Site[]);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!form.title.trim() || !form.url.trim()) {
      toast.error("Informe o nome e o link do site.");
      return;
    }
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("showcase_sites").insert({
      user_id: user.id,
      title: form.title.trim(),
      url: normalizeUrl(form.url),
      description: form.description.trim() || null,
      image_url: form.image_url.trim() ? normalizeUrl(form.image_url) : null,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    setForm({ title: "", url: "", description: "", image_url: "" });
    setAddOpen(false);
    toast.success("Site adicionado à vitrine.");
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("showcase_sites").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível excluir: " + error.message);
      return;
    }
    setSelected(null);
    setSites((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Vitrine</h1>
          <p className="text-sm text-muted-foreground">
            Seus sites em um feed de portfólio. Clique em um card para ver maior e abrir o site.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Adicionar site
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Globe className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            Nenhum site na vitrine ainda. Adicione o primeiro.
          </p>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar site
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => setSelected(site)}
              className="group overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="aspect-video w-full overflow-hidden bg-muted">
                {site.image_url ? (
                  <img
                    src={site.image_url}
                    alt={`Prévia do site ${site.title}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Globe className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-foreground">{site.title}</p>
                {site.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{site.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Expanded view */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            {selected?.description && <DialogDescription>{selected.description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <div className="overflow-hidden rounded-lg border border-border bg-muted">
              {selected?.image_url ? (
                <img
                  src={selected.image_url}
                  alt={`Prévia ampliada do site ${selected.title}`}
                  className="max-h-[60vh] w-full object-contain"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center">
                  <Globe className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild className="w-full gap-2">
                <a href={selected?.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Visitar site
                </a>
              </Button>
              <p className="truncate text-xs text-muted-foreground">{selected?.url}</p>
              <Button
                variant="ghost"
                className="mt-auto w-full justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => selected && setDeletingId(selected.id)}
              >
                <Trash2 className="h-4 w-4" /> Remover da vitrine
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar site</DialogTitle>
            <DialogDescription>Ele aparece no feed da vitrine.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="site-title">Nome</Label>
              <Input
                id="site-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Meu site incrível"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-url">Link do site</Label>
              <Input
                id="site-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="meusite.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-image">Imagem de capa (link)</Label>
              <Input
                id="site-image"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://.../capa.png"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site-desc">Descrição</Label>
              <Textarea
                id="site-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Landing page para..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover site da vitrine?</AlertDialogTitle>
            <AlertDialogDescription>
              O site sai do feed. Isso não afeta o site em si.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) handleDelete(deletingId);
                setDeletingId(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
