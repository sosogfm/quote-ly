import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { NewProposalDialog } from "@/components/evolution/NewProposalDialog";
import { ProposalCard, type ProposalRow } from "@/components/evolution/ProposalCard";
import { RepoSettingsCard } from "@/components/evolution/RepoSettingsCard";
import { AiModelSettingsCard } from "@/components/evolution/AiModelSettingsCard";
import { supabase } from "@/integrations/supabase/client";
import { STATE_LABELS, RISK_LABELS, type ProposalState, type RiskLevel } from "@/lib/evolution/types";
import { Loader2, Search, ShieldCheck } from "lucide-react";

export default function Evolution() {
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("dev_tasks")
      .select("id, title, problem, state, risk_level, requires_migration, created_at")
      .eq("source", "evolution")
      .order("created_at", { ascending: false });
    setRows((data ?? []) as ProposalRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const counters = useMemo(() => ({
    pending: rows.filter((r) => r.state === "awaiting_review" || r.state === "needs_revision").length,
    approved: rows.filter((r) => r.state === "approved").length,
    deployed: rows.filter((r) => r.state === "deployed").length,
    rolledBack: rows.filter((r) => r.state === "rolled_back").length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (stateFilter !== "all" && r.state !== stateFilter) return false;
    if (riskFilter !== "all" && r.risk_level !== riskFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${r.title} ${r.problem ?? ""}`.toLowerCase().includes(q);
  }), [rows, stateFilter, riskFilter, query]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Central de Evolução</h1>
            <p className="text-sm text-muted-foreground">
              Propostas de melhoria do próprio sistema. Toda alteração exige sua aprovação explícita.
            </p>
          </div>
          <NewProposalDialog onCreated={load} />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Nada é alterado sem sua aprovação explícita. Após aprovar, a IA pode abrir um Pull
            Request no GitHub com o diff — você revisa e faz o merge.
          </span>
        </div>

        <RepoSettingsCard />

        <AiModelSettingsCard />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Pendentes", value: counters.pending },
            { label: "Aprovadas", value: counters.approved },
            { label: "Aplicadas", value: counters.deployed },
            { label: "Revertidas", value: counters.rolledBack },
          ].map((c) => (
            <Card key={c.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proposta"
              className="pl-9"
            />
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(Object.keys(STATE_LABELS) as ProposalState[]).map((s) => (
                <SelectItem key={s} value={s}>{STATE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os riscos</SelectItem>
              {(Object.keys(RISK_LABELS) as RiskLevel[]).map((r) => (
                <SelectItem key={r} value={r}>{RISK_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma proposta ainda. Gere a primeira em "Nova proposta".
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((p) => (
              <ProposalCard key={p.id} proposal={p} onDeleted={load} />
            ))}

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
