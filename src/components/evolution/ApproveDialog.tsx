import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import {
  CONFIRMATION_WORD,
  requiresSecondConfirmation,
} from "@/lib/evolution/transitions";
import type { RiskLevel } from "@/lib/evolution/types";

export function ApproveDialog({
  open,
  onOpenChange,
  riskLevel,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  riskLevel: RiskLevel;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const [word, setWord] = useState("");
  const needsSecond = requiresSecondConfirmation(riskLevel);
  const blocked = needsSecond && word.trim().toUpperCase() !== CONFIRMATION_WORD;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setWord(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar aprovação</DialogTitle>
          <DialogDescription>
            Você está aprovando uma alteração no código do sistema. Revise o diff, os riscos, os
            testes e o plano de rollback.
          </DialogDescription>
        </DialogHeader>

        {needsSecond && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Risco elevado. Para continuar, digite <strong>{CONFIRMATION_WORD}</strong>.
              </span>
            </div>
            <Label htmlFor="confirm-word">Palavra de confirmação</Label>
            <Input
              id="confirm-word"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={CONFIRMATION_WORD}
              autoComplete="off"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={blocked || loading} onClick={onConfirm}>
            Aprovar proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
