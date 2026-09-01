import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const LABELS: Record<string, string> = {
  custom: "Local / próprio",
  groq: "Groq",
  openrouter: "OpenRouter",
  lovable: "Lovable AI",
};

/**
 * Compact picker for the primary AI provider. Selecting one moves it to the
 * front of the saved priority order — the automatic fallback chain stays intact.
 */
export function AiProviderSelect() {
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("ai_settings")
      .select("provider_order")
      .eq("id", "global")
      .maybeSingle()
      .then(({ data }) => {
        const o = (data?.provider_order as string[] | undefined) ?? [];
        if (o.length) setOrder(o);
      });
  }, []);

  const onChange = async (value: string) => {
    const next = [value, ...order.filter((p) => p !== value)];
    setOrder(next);
    setSaving(true);
    const { error } = await supabase
      .from("ai_settings")
      .update({ provider_order: next, updated_at: new Date().toISOString() })
      .eq("id", "global");
    setSaving(false);
    if (error) {
      toast.error("Não foi possível trocar o modelo.");
      return;
    }
    toast.success(`Agora começa pelo ${LABELS[value] ?? value}. Fallback automático segue ativo.`);
  };

  if (order.length === 0) return null;

  return (
    <Select value={order[0]} onValueChange={onChange} disabled={saving}>
      <SelectTrigger className="h-7 w-[168px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {order.map((p) => (
          <SelectItem key={p} value={p} className="text-xs">
            {LABELS[p] ?? p}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
