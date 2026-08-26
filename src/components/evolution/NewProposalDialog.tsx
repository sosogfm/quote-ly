import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function NewProposalDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [codeContext, setCodeContext] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (request.trim().length < 10) {
      toast.error("Descreva a melhoria com mais detalhe.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("evolution-propose", {
      body: { request: request.trim(), codeContext },
    });
    setLoading(false);

    const message = (data as { error?: string } | null)?.error;
    if (error || message) {
      toast.error(message ?? "Não foi possível gerar a proposta.");
      return;
    }
    toast.success("Proposta gerada para revisão.");
    setRequest("");
    setCodeContext("");
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Sparkles className="h-4 w-4" />
          Nova proposta
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerar proposta de melhoria</DialogTitle>
          <DialogDescription>
            A IA analisa o pedido e devolve uma proposta com diff, riscos, testes e plano de
            rollback. Nada é aplicado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="request">O que deve melhorar?</Label>
            <Textarea
              id="request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={4}
              placeholder="Ex.: a lista de propostas fica lenta com muitos registros; quero paginação."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="context">Contexto de código (opcional)</Label>
            <Textarea
              id="context"
              value={codeContext}
              onChange={(e) => setCodeContext(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder="Cole aqui os arquivos ou trechos relevantes."
            />
            <p className="text-xs text-muted-foreground">
              Nesta etapa a IA só vê o que você colar aqui.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading} className="gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Gerar proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
