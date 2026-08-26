import { Badge } from "@/components/ui/badge";
import { STATE_LABELS, type ProposalState } from "@/lib/evolution/types";
import { cn } from "@/lib/utils";

const CLASSES: Record<ProposalState, string> = {
  awaiting_review: "border-primary/30 bg-primary/10 text-primary",
  needs_revision: "border-secondary/40 bg-secondary/20 text-secondary-foreground",
  approved: "border-primary bg-primary/15 text-primary",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  deployed: "border-primary bg-primary text-primary-foreground",
  rolled_back: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ state, className }: { state: ProposalState; className?: string }) {
  return (
    <Badge variant="outline" className={cn(CLASSES[state] ?? CLASSES.cancelled, className)}>
      {STATE_LABELS[state] ?? state}
    </Badge>
  );
}
