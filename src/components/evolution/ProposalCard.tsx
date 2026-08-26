import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";
import type { ProposalState, RiskLevel } from "@/lib/evolution/types";
import { Database, FileCode } from "lucide-react";

export type ProposalRow = {
  id: string;
  title: string;
  problem: string | null;
  state: string;
  risk_level: string | null;
  requires_migration: boolean;
  created_at: string;
};

export function ProposalCard({ proposal, fileCount }: { proposal: ProposalRow; fileCount?: number }) {
  return (
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
            <span className="ml-auto text-xs text-muted-foreground">
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
  );
}
