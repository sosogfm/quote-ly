import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";
import type { ProposalState, RiskLevel } from "@/lib/evolution/types";
import { Database, FileCode, Trash2 } from "lucide-react";

export type ProposalRow = {
  id: string;
  title: string;
  problem: string | null;
  state: string;
  risk_level: string | null;
  requires_migration: boolean;
  created_at: string;
};

export function ProposalCard({
  proposal,
  fileCount,
  onDeleted,
}: {
  proposal: ProposalRow;
  fileCount?: number;
  onDeleted?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    const { error } = await supabase.from("dev_tasks").delete().eq("id", proposal.id);
    setDeleting(false);
    setConfirming(false);
    if (error) {
      toast.error("Não foi possível excluir a proposta.");
      return;
    }
    toast.success("Proposta excluída.");
    onDeleted?.();
  };

  return (
    <div className="relative">
      <Link to={`/evolution/${proposal.id}`}>
        <Card className="transition-colors hover:border-primary/50">
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge state={proposal.state as ProposalState} />
              <RiskBadge level={proposal.risk_level as RiskLevel | null} />
              {proposal.requires_migration && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Database className="h-3 w-3" /> banco
                </span>
              )}
              {typeof fileCount === "number" && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileCode className="h-3 w-3" /> {fileCount}
                </span>
              )}
              <span className="ml-auto pr-8 text-xs text-muted-foreground">
                {new Date(proposal.created_at).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <h3 className="font-medium leading-tight">{proposal.title}</h3>
            {proposal.problem && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{proposal.problem}</p>
            )}
          </CardContent>
        </Card>
      </Link>

      {onDeleted && (
        <button
          type="button"
          aria-label={`Excluir proposta ${proposal.title}`}
          onClick={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              A proposta, seus patches e o histórico serão apagados. O Pull Request no
              GitHub, se existir, continua lá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={remove}>
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
