import { Clock } from "lucide-react";

export type TimelineEvent = {
  id: string;
  action: string;
  from_state: string | null;
  to_state: string | null;
  detail: unknown;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  proposal_created: "Proposta gerada",
  approve: "Aprovada",
  reject: "Rejeitada",
  request_revision: "Revisão solicitada",
  record_test: "Teste registrado",
  test_recorded: "Teste registrado",
  confirm_migration: "Alteração de banco confirmada",
  migration_confirmed: "Alteração de banco confirmada",
  mark_applied: "Marcada como aplicada",
  rollback: "Revertida",
  cancel: "Cancelada",
};

export function ProposalTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">Sem histórico ainda.</p>;
  }

  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const reason = (e.detail as { reason?: string } | null)?.reason;
        return (
          <li key={e.id} className="flex gap-3 border-l-2 border-border pl-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{ACTION_LABELS[e.action] ?? e.action}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString("pt-BR")}
              </p>
              {reason && <p className="mt-1 text-sm text-muted-foreground">{reason}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
