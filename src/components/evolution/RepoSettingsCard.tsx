import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { RISK_LABELS, type RiskLevel } from "@/lib/evolution/types";
import { Github, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  id?: string;
  repo_owner: string;
  repo_name: string;
  base_branch: string;
  auto_apply_enabled: boolean;
  max_auto_risk: string;
};

const EMPTY: Settings = {
  repo_owner: "",
  repo_name: "",
  base_branch: "main",
  auto_apply_enabled: true,
  max_auto_risk: "medium",
};

export function RepoSettingsCard() {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("evolution_repo_settings")
        .select("id, repo_owner, repo_name, base_branch, auto_apply_enabled, max_auto_risk")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) setSettings(data as Settings);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!settings.repo_owner.trim() || !settings.repo_name.trim()) {
      toast.error("Informe o dono e o nome do repositório.");
      return;
    }
    setSaving(true);
    const payload = {
      repo_owner: settings.repo_owner.trim(),
      repo_name: settings.repo_name.trim(),
      base_branch: settings.base_branch.trim() || "main",
      auto_apply_enabled: settings.auto_apply_enabled,
      max_auto_risk: settings.max_auto_risk,
    };

    const { data, error } = settings.id
      ? await supabase
          .from("evolution_repo_settings")
          .update(payload)
          .eq("id", settings.id)
          .select("id")
          .single()
      : await supabase
          .from("evolution_repo_settings")
          .insert(payload)
          .select("id")
          .single();

    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar as configurações.");
      return;
    }
    setSettings((s) => ({ ...s, id: data.id }));
    toast.success("Configurações do repositório salvas.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Github className="h-4 w-4" /> Repositório para aplicação automática
        </CardTitle>
        <CardDescription>
          Ao aprovar uma proposta, a IA cria uma branch e abre um Pull Request neste repositório.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="repo-owner">Dono / organização</Label>
                <Input
                  id="repo-owner"
                  value={settings.repo_owner}
                  onChange={(e) => setSettings({ ...settings, repo_owner: e.target.value })}
                  placeholder="sosogfm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repo-name">Repositório</Label>
                <Input
                  id="repo-name"
                  value={settings.repo_name}
                  onChange={(e) => setSettings({ ...settings, repo_name: e.target.value })}
                  placeholder="quote-ly"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repo-branch">Branch base</Label>
                <Input
                  id="repo-branch"
                  value={settings.base_branch}
                  onChange={(e) => setSettings({ ...settings, base_branch: e.target.value })}
                  placeholder="main"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Risco máximo permitido</Label>
                <Select
                  value={settings.max_auto_risk}
                  onValueChange={(v) => setSettings({ ...settings, max_auto_risk: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["low", "medium", "high"] as RiskLevel[]).map((r) => (
                      <SelectItem key={r} value={r}>{RISK_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-end gap-3 pb-2">
                <Switch
                  checked={settings.auto_apply_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, auto_apply_enabled: v })}
                />
                <span className="text-sm text-muted-foreground">
                  Permitir que a IA abra Pull Requests
                </span>
              </label>
            </div>

            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar configurações
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
