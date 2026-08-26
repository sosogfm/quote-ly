import { Badge } from "@/components/ui/badge";
import { RISK_LABELS, type RiskLevel } from "@/lib/evolution/types";
import { cn } from "@/lib/utils";

const CLASSES: Record<RiskLevel, string> = {
  low: "border-primary/30 bg-primary/10 text-primary",
  medium: "border-secondary/40 bg-secondary/20 text-secondary-foreground",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  critical: "border-destructive bg-destructive text-destructive-foreground",
};

export function RiskBadge({ level, className }: { level: RiskLevel | null; className?: string }) {
  if (!level) return null;
  return (
    <Badge variant="outline" className={cn(CLASSES[level], className)}>
      {RISK_LABELS[level]}
    </Badge>
  );
}
