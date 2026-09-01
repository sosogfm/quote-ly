import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

type AiSettings = {
  provider_order: string[];
  groq_chat_model: string;
  groq_fast_model: string;
  openrouter_chat_model: string;
  openrouter_fast_model: string;
  lovable_chat_model: string;
  custom_enabled: boolean;
  custom_label: string;
  custom_base_url: string | null;
  custom_chat_model: string | null;
  custom_fast_model: string | null;
  custom_supports_structured: boolean;
};

const EMPTY: AiSettings = {
  provider_order: ["custom", "groq", "openrouter", "lovable"],
  groq_chat_model: "openai/gpt-oss-120b",
  groq_fast_model: "openai/gpt-oss-20b",
  openrouter_chat_model: "minimax/minimax-m3:free",
  openrouter_fast_model: "minimax/minimax-m3:free",
  lovable_chat_model: "google/gemini-3.7-flash",
  custom_enabled: false,
  custom_label: "Local",
  custom_base_url: "",
  custom_chat_model: "",
  custom_fast_model: "",
  custom_supports_structured: false,
};

const PROVIDER_LABELS: Record<string, string> = {
  custom: "Personalizado / local",
  groq: "Groq (grátis, com limite)",
  openrouter: "OpenRouter (modelos :free)",
  lovable: "Lovable AI (consome créditos)",
};

export function AiModelSettingsCard() {
  const [settings, setSettings] = useState<AiSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ai_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();
      if (data) setSettings({ ...EMPTY, ...(data as unknown as AiSettings) });
      setLoading(false);
    })();
  }, []);

  const move = (index: number, dir: -1 | 1) => {
    const order = [...settings.provider_order];
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    setSettings({ ...settings, provider_order: order });
  };

  const save = async () => {
    if (settings.custom_enabled) {
      const url = (settings.custom_base_url ?? "").trim();
      if (!/^https?:\/\//.test(url)) {
        toast.error("Informe a URL base do provedor local (http:// ou https://).");
        return;
      }
      if (!(settings.custom_chat_model ?? "").trim()) {
        toast.error("Informe o modelo do provedor local.");
        return;
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from("ai_settings")
      .update({
        provider_order: settings.provider_order,
        groq_chat_model: settings.groq_chat_model.trim(),
        groq_fast_model: settings.groq_fast_model.trim(),
        openrouter_chat_model: settings.openrouter_chat_model.trim(),
        openrouter_fast_model: settings.openrouter_fast_model.trim(),
        lovable_chat_model: settings.lovable_chat_model.trim(),
        custom_enabled: settings.custom_enabled,
        custom_label: settings.custom_label.trim() || "Local",
        custom_base_url: (settings.custom_base_url ?? "").trim() || null,
        custom_chat_model: (settings.custom_chat_model ?? "").trim() || null,
        custom_fast_model: (settings.custom_fast_model ?? "").trim() || null,
        custom_supports_structured: settings.custom_supports_structured,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "global");
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar as configurações de IA.");
      return;
    }
    toast.success("Configurações de IA salvas. Vale em até 20 segundos.");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações de IA...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" /> Modelos de IA
        </CardTitle>
        <CardDescription>
          Escolha manualmente os modelos e a ordem de prioridade dos provedores. Se um falhar ou
          bater no limite, o próximo da lista assume automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Ordem de prioridade</Label>
          <div className="space-y-2">
            {settings.provider_order.map((name, i) => (
              <div
                key={name}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{i + 1}</Badge>
                  {PROVIDER_LABELS[name] ?? name}
                </span>
                <span className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === settings.provider_order.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="groq-chat">Groq — modelo principal</Label>
            <Input
              id="groq-chat"
              value={settings.groq_chat_model}
              onChange={(e) => setSettings({ ...settings, groq_chat_model: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="groq-fast">Groq — modelo rápido</Label>
            <Input
              id="groq-fast"
              value={settings.groq_fast_model}
              onChange={(e) => setSettings({ ...settings, groq_fast_model: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="or-chat">OpenRouter — modelo principal</Label>
            <Input
              id="or-chat"
              value={settings.openrouter_chat_model}
              onChange={(e) => setSettings({ ...settings, openrouter_chat_model: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="or-fast">OpenRouter — modelo rápido</Label>
            <Input
              id="or-fast"
              value={settings.openrouter_fast_model}
              onChange={(e) => setSettings({ ...settings, openrouter_fast_model: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="lovable-chat">Lovable AI — modelo</Label>
            <Input
              id="lovable-chat"
              value={settings.lovable_chat_model}
              onChange={(e) => setSettings({ ...settings, lovable_chat_model: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="custom-enabled">Provedor próprio / local (sem limite)</Label>
              <p className="text-xs text-muted-foreground">
                Qualquer endpoint compatível com a API da OpenAI: Ollama, LM Studio, vLLM,
                llama.cpp. Precisa estar acessível pela internet (ex.: túnel Cloudflare ou ngrok) —
                <span className="font-medium"> localhost não funciona</span>, porque a chamada sai do
                servidor, não do seu navegador.
              </p>
            </div>
            <Switch
              id="custom-enabled"
              checked={settings.custom_enabled}
              onCheckedChange={(v) => setSettings({ ...settings, custom_enabled: v })}
            />
          </div>

          {settings.custom_enabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="custom-label">Nome exibido</Label>
                <Input
                  id="custom-label"
                  value={settings.custom_label}
                  onChange={(e) => setSettings({ ...settings, custom_label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-url">URL base (terminando em /v1)</Label>
                <Input
                  id="custom-url"
                  placeholder="https://meu-tunel.trycloudflare.com/v1"
                  value={settings.custom_base_url ?? ""}
                  onChange={(e) => setSettings({ ...settings, custom_base_url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-model">Modelo principal</Label>
                <Input
                  id="custom-model"
                  placeholder="llama3.1:8b"
                  value={settings.custom_chat_model ?? ""}
                  onChange={(e) => setSettings({ ...settings, custom_chat_model: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-fast">Modelo rápido (opcional)</Label>
                <Input
                  id="custom-fast"
                  placeholder="llama3.2:3b"
                  value={settings.custom_fast_model ?? ""}
                  onChange={(e) => setSettings({ ...settings, custom_fast_model: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-4 sm:col-span-2">
                <Label htmlFor="custom-structured">
                  Suporta JSON estruturado (json_schema)
                </Label>
                <Switch
                  id="custom-structured"
                  checked={settings.custom_supports_structured}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, custom_supports_structured: v })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Se o seu endpoint exigir chave, guarde-a no segredo{" "}
                <code>CUSTOM_AI_API_KEY</code> do backend.
              </p>
            </div>
          )}
        </div>

        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar configurações
        </Button>
      </CardContent>
    </Card>
  );
}
