import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileImage, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  downloadPdf,
  downloadPng,
  downloadText,
  textExtension,
  type ArtifactLike,
} from "@/lib/artifactDownload";

export interface ArtifactsPanelProps {
  artifacts: ArtifactLike[];
  onClose: () => void;
}

export function ArtifactsPanel({ artifacts, onClose }: ArtifactsPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (a: ArtifactLike, fn: (a: ArtifactLike) => void | Promise<void>) => {
    setBusyId(a.id);
    try {
      await fn(a);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível gerar o arquivo.",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">Arquivos</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {artifacts.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">
              Nenhum arquivo nesta conversa. Peça um PDF, PNG, planilha ou código e ele
              aparece aqui para download.
            </p>
          )}

          {artifacts.map((a) => (
            <article key={a.id} className="rounded-lg border border-border p-3">
              <p className="truncate text-sm font-medium">{a.title}</p>
              <p className="mt-0.5 text-xs uppercase text-muted-foreground">
                {a.kind}
                {a.language ? ` · ${a.language}` : ""}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={busyId === a.id}
                  onClick={() => run(a, downloadPdf)}
                >
                  {busyId === a.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <FileText className="h-3 w-3" />
                  )}
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={busyId === a.id}
                  onClick={() => run(a, downloadPng)}
                >
                  <FileImage className="h-3 w-3" />
                  PNG
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => run(a, downloadText)}
                >
                  <Download className="h-3 w-3" />
                  .{textExtension(a)}
                </Button>
              </div>
            </article>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
